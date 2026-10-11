import { createHash } from "node:crypto";
import { normalizeArtistName } from "@/domain/artist-identity";
import { matchIndianCity } from "@/domain/cities";
import type { LiveEvent, TicketStatusKind } from "@/domain/types";
import type { SourceArtistRef, SourceEventRecord } from "@/integrations/events/contract";
import { generateJson, GeminiError, geminiStatus } from "@/integrations/gemini/client";
import {
  buildUserText,
  extractionJsonSchema,
  extractionSchema,
  MAX_INPUT_CHARS,
  PROMPT_VERSION,
  SYSTEM_INSTRUCTION,
  type Extraction,
} from "@/integrations/gemini/announcement-extraction";
import { getSql } from "./db";
import { normalizeRecord } from "./ingest/normalize";
import { upsertRecord } from "./ingest/upsert";
import { log, type ErrorCategory } from "./log";
import { getEventById } from "./repos/events";
import { sanitizeExternalUrl } from "./safe-fetch";

/**
 * Announcement intake: pasted text → Gemini extraction → deterministic
 * grounding checks → the same normalise/dedup/upsert path as any source.
 *
 * Gemini does language understanding only. Everything after the model is
 * deterministic: evidence must appear verbatim in the text, URLs must appear
 * verbatim, dates need an explicit year, cities are matched against the
 * known list, and artists are matched to the user's followed artists by
 * exact normalised name/alias. The result is stored as a single,
 * user-submitted source — "unconfirmed" until another source corroborates it.
 */

export type AnnouncementOutcome =
  | { status: "extracted"; event: LiveEvent; dropped: string[]; uncertainties: string[]; announcementType: string; cached: boolean }
  | { status: "not_an_event" | "no_matching_artist" | "ambiguous_artist" | "needs_review"; message: string; extraction?: PublicExtraction; dropped: string[] }
  | { status: "failed"; category: ErrorCategory; message: string };

/** What we show the user about the extraction (no raw model output). */
export interface PublicExtraction {
  artists: string[];
  date: string | null;
  dateText: string | null;
  venue: string | null;
  city: string | null;
  announcementType: string;
  uncertainties: string[];
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Gives a model-returned local timestamp an explicit offset. Only when the
 * venue is a confirmed Indian city is the zone known (IST, +05:30); otherwise
 * an offset-less time is dropped rather than guessed.
 */
export function withKnownOffset(value: string | null | undefined, indianCity: boolean): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/(Z|[+-]\d{2}:\d{2})$/.test(v)) return Number.isNaN(Date.parse(v)) ? undefined : v;
  if (!indianCity || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return undefined;
  const withSeconds = v.length === 16 ? `${v}:00` : v;
  return `${withSeconds}+05:30`;
}
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Grounding: drop any value whose evidence isn't actually in the text. */
export function ground(x: Extraction, text: string): { x: Extraction; dropped: string[] } {
  const hay = squash(text);
  const inText = (q: string | null | undefined) => !!q && hay.includes(squash(q));
  const dropped: string[] = [];
  const check = <K extends "event_title" | "start_time" | "venue" | "city" | "country" | "ticket_url" | "ticket_sale_opens">(k: K) => {
    const f = x[k];
    if (f.value !== null && !inText(f.evidence)) {
      dropped.push(k);
      x[k] = { value: null, evidence: null } as Extraction[K];
    }
  };
  (["event_title", "start_time", "venue", "city", "country", "ticket_url", "ticket_sale_opens"] as const).forEach(check);

  // A ticket URL must appear character-for-character (ignoring scheme).
  if (x.ticket_url.value) {
    const bare = x.ticket_url.value.replace(/^https?:\/\//, "");
    if (!text.includes(bare)) {
      dropped.push("ticket_url");
      x.ticket_url = { value: null, evidence: null };
    }
  }
  // A date counts only if its year is written in the text.
  if (x.date.value && !text.includes(x.date.value.slice(0, 4))) {
    dropped.push("date");
    x.date = { value: null, raw_text: x.date.raw_text, ambiguous: true };
  }
  if (x.early_bird.status !== "not_mentioned" && !inText(x.early_bird.evidence)) {
    dropped.push("early_bird");
    x.early_bird = { status: "not_mentioned", ends_at: null, evidence: null };
  }
  x.artists = x.artists.filter((a) => {
    const keep = inText(a.name);
    if (!keep) dropped.push(`artist:${a.name}`);
    return keep;
  });
  return { x, dropped };
}

export function ticketFrom(x: Extraction): { status: TicketStatusKind; exposes: boolean } {
  switch (x.announcement_type) {
    case "sold_out":
      return { status: "sold_out", exposes: true };
    case "tickets_on_sale_now":
      return { status: "on_sale", exposes: true };
    case "tickets_on_sale_soon":
      return { status: "announced_not_on_sale", exposes: true };
    default:
      if (x.early_bird.status === "available" || x.early_bird.status === "ending_soon") return { status: "early_bird", exposes: true };
      return { status: "unknown", exposes: false };
  }
}

function publicView(x: Extraction): PublicExtraction {
  return {
    artists: x.artists.map((a) => a.name),
    date: x.date.value,
    dateText: x.date.raw_text,
    venue: x.venue.value,
    city: x.city.value,
    announcementType: x.announcement_type,
    uncertainties: x.uncertainties,
  };
}

export async function extractCached(text: string): Promise<{ x: Extraction; cached: boolean }> {
  const { model } = geminiStatus();
  const hash = sha(`${PROMPT_VERSION}|${model}|${text}`);
  const sql = getSql();
  const [hit] = await sql<{ status: string; output: unknown }[]>`
    select status, output from radar.ai_extractions where input_hash = ${hash}`;
  if (hit?.status === "ok") {
    const parsed = extractionSchema.safeParse(hit.output);
    if (parsed.success) return { x: parsed.data, cached: true };
  }

  let json: unknown;
  let usedModel = model;
  try {
    ({ json, model: usedModel } = await generateJson({
      systemInstruction: SYSTEM_INSTRUCTION,
      userText: buildUserText(text),
      jsonSchema: extractionJsonSchema,
    }));
  } catch (err) {
    const category = err instanceof GeminiError ? err.category : "ai_unavailable";
    await sql`insert into radar.ai_extractions (input_hash, model, prompt_version, status, error_category)
              values (${hash}, ${model}, ${PROMPT_VERSION}, 'failed', ${category})
              on conflict (input_hash) do update set status = 'failed', error_category = excluded.error_category, created_at = now()`;
    throw err;
  }
  const parsed = extractionSchema.safeParse(json);
  if (!parsed.success) {
    log.warn("gemini", "output failed schema validation", { issue: parsed.error.issues[0]?.message, model: usedModel });
    await sql`insert into radar.ai_extractions (input_hash, model, prompt_version, status, error_category)
              values (${hash}, ${usedModel}, ${PROMPT_VERSION}, 'invalid_output', 'ai_invalid_output')
              on conflict (input_hash) do update set status = 'invalid_output', created_at = now()`;
    throw new GeminiError("Gemini's answer didn't match the expected format", "ai_invalid_output");
  }
  await sql`insert into radar.ai_extractions (input_hash, model, prompt_version, status, output)
            values (${hash}, ${usedModel}, ${PROMPT_VERSION}, 'ok', ${sql.json(parsed.data as never)})
            on conflict (input_hash) do update set status = 'ok', output = excluded.output, model = excluded.model, created_at = now()`;
  return { x: parsed.data, cached: false };
}

export async function processAnnouncement(userId: string, rawText: string, sourceUrl?: string): Promise<AnnouncementOutcome> {
  const text = rawText.replace(/\r\n/g, "\n").trim().slice(0, MAX_INPUT_CHARS);
  const sql = getSql();
  const record = async (status: string, eventId: string | null, category: string | null) => {
    await sql`insert into radar.announcements (user_id, text_hash, text_excerpt, source_url, status, event_id, error_category)
              values (${userId}, ${sha(text)}, ${text.slice(0, 280)}, ${sanitizeExternalUrl(sourceUrl) ?? null}, ${status}, ${eventId}, ${category})`;
  };

  let extracted: { x: Extraction; cached: boolean };
  try {
    extracted = await extractCached(text);
  } catch (err) {
    const category = err instanceof GeminiError ? err.category : "ai_unavailable";
    await record("failed", null, category);
    const message =
      category === "not_configured"
        ? "AI extraction isn't configured on this server."
        : category === "ai_invalid_output"
          ? "The AI's answer couldn't be validated, so nothing was saved."
          : "The AI service is unavailable right now. Nothing was saved — try again shortly.";
    return { status: "failed", category, message };
  }

  const { x, dropped } = ground(structuredClone(extracted.x), text);
  if (!x.is_event_announcement || x.announcement_type === "not_an_event") {
    await record("not_an_event", null, null);
    return { status: "not_an_event", message: "This doesn't look like an announcement for a specific show.", extraction: publicView(x), dropped };
  }

  // Match performers to the user's followed artists — exact normalised name/alias only.
  const followed = await sql<{ id: string; name: string; aliases: string[]; musicbrainz_id: string | null }[]>`
    select a.id, a.name, a.aliases, a.musicbrainz_id from radar.artists a
    join radar.user_artists ua on ua.artist_id = a.id where ua.user_id = ${userId}`;
  const asked: SourceArtistRef[] = followed.map((f) => ({ artistId: f.id, name: f.name, aliases: f.aliases, musicbrainzId: f.musicbrainz_id ?? undefined }));
  const matches = x.artists.map((a) => asked.filter((f) => [f.name, ...f.aliases].some((n) => normalizeArtistName(n) === normalizeArtistName(a.name))));
  if (matches.some((m) => m.length > 1)) {
    await record("ambiguous_artist", null, null);
    return { status: "ambiguous_artist", message: "More than one of your artists shares this name, so we didn't guess which one.", extraction: publicView(x), dropped };
  }
  if (!matches.some((m) => m.length === 1)) {
    await record("no_matching_artist", null, null);
    return {
      status: "no_matching_artist",
      message: "None of the named artists are in your list. Add the artist first if you want to track this show.",
      extraction: publicView(x),
      dropped,
    };
  }

  const city = matchIndianCity(x.city.value);
  const ticket = ticketFrom(x);
  const sourceRecord: SourceEventRecord = {
    // Per-user id: two people pasting the same text get separate private records.
    sourceEventId: sha(`${userId}|${text}`).slice(0, 32),
    sourceUrl: sanitizeExternalUrl(sourceUrl),
    title: x.event_title.value ?? `${x.artists.map((a) => a.name).join(", ")} live`,
    kind: "concert",
    performers: x.artists.map((a) => ({ name: a.name })),
    localDate: x.date.value ?? undefined,
    localTime: x.date.value ? (x.start_time.value ?? undefined) : undefined,
    timeZone: city ? "Asia/Kolkata" : undefined,
    venueName: x.venue.value ?? undefined,
    cityName: city?.name ?? x.city.value ?? undefined,
    state: city?.region,
    countryCode: city ? "IN" : undefined,
    eventStatus:
      x.announcement_type === "cancelled" ? "cancelled" : x.announcement_type === "date_changed" || x.announcement_type === "venue_changed" ? "rescheduled" : "scheduled",
    ticket: {
      status: ticket.status,
      sourceExposesAvailability: ticket.exposes,
      url: x.ticket_url.value ? sanitizeExternalUrl(/^https?:\/\//.test(x.ticket_url.value) ? x.ticket_url.value : `https://${x.ticket_url.value}`) : undefined,
      saleOpensAt: withKnownOffset(x.ticket_sale_opens.value, Boolean(city)),
      earlyBirdEndsAt: withKnownOffset(x.early_bird.ends_at, Boolean(city)),
    },
  };

  const norm = normalizeRecord(sourceRecord, { id: "announcement", name: "Your pasted announcement", sourceClass: "user_submitted" }, asked, userId);
  if (!norm.ok) {
    await record("needs_review", null, "validation_failed");
    return { status: "needs_review", message: `The extracted details didn't pass validation (${norm.reason}).`, extraction: publicView(x), dropped };
  }
  const res = await upsertRecord(sql, norm.record);
  await record("extracted", res.eventId, null);
  const event = await getEventById(res.eventId, userId);
  if (!event) return { status: "failed", category: "internal", message: "The show was saved but couldn't be read back." };
  return { status: "extracted", event, dropped, uncertainties: x.uncertainties, announcementType: x.announcement_type, cached: extracted.cached };
}
