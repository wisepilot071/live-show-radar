import { createHash } from "node:crypto";
import type { z } from "zod";
import { getServerEnv } from "@/config/server-env";
import type { SourceArtistRef } from "@/integrations/events/contract";
import { generateJson, GeminiError, geminiStatus } from "@/integrations/gemini/client";
import {
  LISTING_PROMPT_VERSION,
  LISTING_SYSTEM_INSTRUCTION,
  listingJsonSchema,
  listingSchema,
  TOUR_PROMPT_VERSION,
  TOUR_SYSTEM_INSTRUCTION,
  tourJsonSchema,
  tourSchema,
  type ListingExtraction,
  type TourExtraction,
} from "@/integrations/gemini/tour-extraction";
import { findCity } from "@/domain/cities";
import { getSql } from "./db";
import { rateLimit } from "./guards";
import { log } from "./log";
import { safeFetchJson } from "./safe-fetch";

/**
 * Gemini extraction of one article text, cached in radar.ai_extractions by
 * (prompt version, model, text) so the same article is never sent twice.
 * Failures are recorded too (and retried on a later run).
 */
async function cachedExtraction<T>(
  text: string,
  spec: { version: string; system: string; jsonSchema: unknown; schema: z.ZodType<T> },
): Promise<T> {
  const { model } = geminiStatus();
  const hash = createHash("sha256").update(`${spec.version}|${model}|${text}`).digest("hex");
  const sql = getSql();
  const [hit] = await sql<{ status: string; output: unknown }[]>`
    select status, output from radar.ai_extractions where input_hash = ${hash}`;
  if (hit?.status === "ok") {
    const parsed = spec.schema.safeParse(hit.output);
    if (parsed.success) return parsed.data;
  }
  let json: unknown;
  let usedModel = model;
  try {
    ({ json, model: usedModel } = await generateJson({
      systemInstruction: spec.system,
      userText: `ARTICLE:\n"""\n${text}\n"""`,
      jsonSchema: spec.jsonSchema,
    }));
  } catch (err) {
    const category = err instanceof GeminiError ? err.category : "ai_unavailable";
    await sql`insert into radar.ai_extractions (input_hash, model, prompt_version, status, error_category)
              values (${hash}, ${model}, ${spec.version}, 'failed', ${category})
              on conflict (input_hash) do update set status = 'failed', error_category = excluded.error_category, created_at = now()`;
    throw err;
  }
  const parsed = spec.schema.safeParse(json);
  if (!parsed.success) {
    log.warn("gemini", "article output failed schema validation", { version: spec.version, issue: parsed.error.issues[0]?.message, model: usedModel });
    throw new GeminiError("Gemini's answer didn't match the expected format", "ai_invalid_output");
  }
  await sql`insert into radar.ai_extractions (input_hash, model, prompt_version, status, output)
            values (${hash}, ${usedModel}, ${spec.version}, 'ok', ${sql.json(parsed.data as never)})
            on conflict (input_hash) do update set status = 'ok', output = excluded.output, model = excluded.model, created_at = now()`;
  return parsed.data;
}

/** One artist's tour schedule from a full article. */
export function extractTourCached(text: string): Promise<TourExtraction> {
  return cachedExtraction(text, { version: TOUR_PROMPT_VERSION, system: TOUR_SYSTEM_INSTRUCTION, jsonSchema: tourJsonSchema, schema: tourSchema });
}

/** Many artists' shows from a city listing article (the daily sweep). */
export function extractListingCached(text: string): Promise<ListingExtraction> {
  return cachedExtraction(text, {
    version: LISTING_PROMPT_VERSION,
    system: LISTING_SYSTEM_INSTRUCTION,
    jsonSchema: listingJsonSchema,
    schema: listingSchema,
  });
}

/**
 * Cities to sweep this run, gated in the DB so searches (credits) stay bounded:
 * the always-on cities (NEWS_SWEEP_CITIES, default Bengaluru) once a day, plus at
 * most ONE other city that someone chose as their home city, each every 3 days.
 */
export async function newsSweepCitiesDue(): Promise<string[]> {
  const out: string[] = [];
  const base = getServerEnv().scrapingbee.sweepCities;
  for (const city of base) if ((await rateLimit(`news-sweep:${city.toLowerCase()}`, 1, 20 * 3600)).allowed) out.push(city);
  const homes = await getSql()<{ primary_city_id: string }[]>`
    select distinct p.primary_city_id from radar.user_preferences p
    where p.primary_city_id is not null
      and exists (select 1 from radar.user_artists ua where ua.user_id = p.user_id)`;
  for (const { primary_city_id } of homes) {
    const city = findCity(primary_city_id);
    if (!city || base.some((b) => b.toLowerCase() === city.name.toLowerCase())) continue;
    if ((await rateLimit(`news-sweep:${city.id}`, 1, 72 * 3600)).allowed) {
      out.push(city.name);
      break;
    }
  }
  return out;
}

const ARTIST_NEWS_RECHECK_DAYS = 7;

/**
 * Who gets a per-artist news search this run: never-checked artists first (so a
 * freshly followed artist is looked up next run), then the least recently
 * checked, skipping anyone checked within the last week.
 */
export async function newsArtistsDue(artists: SourceArtistRef[], cap: number): Promise<SourceArtistRef[]> {
  if (artists.length === 0 || cap <= 0) return [];
  const rows = await getSql()<{ artist_id: string; last_attempt_at: Date }[]>`
    select artist_id, last_attempt_at from radar.artist_source_checks
    where source_id = 'scrapingbee_news' and artist_id = any(${artists.map((a) => a.artistId)})`;
  const last = new Map(rows.map((r) => [r.artist_id, r.last_attempt_at.getTime()]));
  const cutoff = Date.now() - ARTIST_NEWS_RECHECK_DAYS * 86_400_000;
  return artists
    .filter((a) => (last.get(a.artistId) ?? 0) < cutoff)
    .sort((a, b) => (last.get(a.artistId) ?? 0) - (last.get(b.artistId) ?? 0))
    .slice(0, cap);
}

/** Remaining ScrapingBee credits from its usage endpoint (free to call), or null if unknown. */
export async function scrapingBeeCreditsLeft(): Promise<number | null> {
  const { apiKey } = getServerEnv().scrapingbee;
  if (!apiKey) return null;
  try {
    const u = new URL("https://app.scrapingbee.com/api/v1/usage");
    u.searchParams.set("api_key", apiKey);
    const body = (await safeFetchJson(u.toString(), { allowHosts: ["app.scrapingbee.com"], timeoutMs: 8000 })) as {
      max_api_credit?: number;
      used_api_credit?: number;
    };
    if (typeof body.max_api_credit !== "number" || typeof body.used_api_credit !== "number") return null;
    return body.max_api_credit - body.used_api_credit;
  } catch {
    return null;
  }
}
