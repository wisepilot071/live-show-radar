/**
 * Bookings, Telegram linking/delivery and Google Calendar sync against the
 * database with ISOLATED TEST records. Every provider call (Telegram, Google)
 * is MOCKED and the bot token is replaced by a TEST value for the run, so no
 * real message or calendar event can be produced. All rows are deleted after.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HAS_DB } from "./setup-env";
import type { AdapterOutcome, EventSourceAdapter } from "@/integrations/events/contract";
import { deleteBooking, getBooking, listBookings, notifyBooking, saveBooking, syncBookingCalendar } from "@/server/bookings";
import { encryptSecret } from "@/server/crypto";
import { getSql } from "@/server/db";
import { runDiscovery } from "@/server/ingest/pipeline";
import { channelPrefsOf, createNotificationRecord, deliverPending } from "@/server/notifications/process";
import { consumeLinkToken, createLinkToken, handleTelegramUpdate, telegramLinkOf } from "@/server/notifications/telegram";
import { fixtureRecord } from "../fixtures/source-records";

const RUN = randomUUID().slice(0, 8);
const fan = randomUUID();
const other = randomUUID();
const artistId = randomUUID();
const artistName = `TEST Booking Band ${RUN}`;
const nextYear = new Date().getUTCFullYear() + 1;
const chatId = 9_000_000_000 + Math.floor(Math.random() * 1_000_000); // fake chat, never a real user
let eventId = "";

const ENV_KEYS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_BASE_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};

describe.skipIf(!HAS_DB)("bookings + Telegram + Calendar (isolated TEST records, mocked providers)", () => {
  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    Object.assign(process.env, {
      TELEGRAM_BOT_TOKEN: "TEST:not-a-real-token",
      TELEGRAM_BOT_USERNAME: "test_radar_bot",
      TELEGRAM_WEBHOOK_SECRET: "TEST-webhook-secret",
      GOOGLE_CLIENT_ID: "TEST-client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "TEST-client-secret",
      APP_BASE_URL: "https://radar.example",
    });
    const sql = getSql();
    await sql`insert into radar.users (id) values (${fan}), (${other})`;
    await sql`insert into radar.artists (id, catalogue_key, name, origin) values (${artistId}, ${`test:${RUN}`}, ${artistName}, 'event_source')`;
    await sql`insert into radar.user_artists (user_id, artist_id, added_via) values (${fan}, ${artistId}, 'manual')`;
    const source: EventSourceAdapter = {
      id: `test_fixture_booking_${RUN}`,
      name: "TEST booking source",
      sourceClass: "listing",
      configStatus: () => ({ configured: true }),
      canLookUp: () => true,
      fetchForArtists: async (): Promise<AdapterOutcome> => ({
        ok: true,
        records: [
          fixtureRecord({
            sourceEventId: `TEST-${RUN}-booked`,
            performers: [{ name: artistName }],
            localDate: `${nextYear}-06-20`,
            localTime: "19:30",
          }),
        ],
        checkedArtistIds: [artistId],
        artistFailures: [],
      }),
    };
    await runDiscovery({ trigger: "admin", sources: [source] });
    const [row] = await sql<{ event_id: string }[]>`select event_id from radar.event_artists where artist_id = ${artistId} limit 1`;
    eventId = row!.event_id;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    const sql = getSql();
    await sql`delete from radar.events e using radar.event_artists ea where ea.event_id = e.id and ea.artist_id = ${artistId}`;
    await sql`delete from radar.ingestion_runs where source_id = ${`test_fixture_booking_${RUN}`}`;
    await sql`delete from radar.users where id in (${fan}, ${other})`; // cascades bookings, links, tokens, connections, notifications
    await sql`delete from radar.artists where id = ${artistId}`;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    await sql.end({ timeout: 2 });
    globalThis.__lsrSql = undefined;
  });

  /* ---------------- Telegram linking ---------------- */

  it("link tokens are single-use, expire, and bind the right profile", async () => {
    const link = await createLinkToken(fan);
    expect(link?.url).toMatch(/^https:\/\/t\.me\/test_radar_bot\?start=[A-Za-z0-9_-]{16,64}$/);
    const token = new URL(link!.url).searchParams.get("start")!;
    expect(await consumeLinkToken(token)).toBe(fan);
    expect(await consumeLinkToken(token)).toBeNull(); // reuse refused
    const expired = await createLinkToken(other, new Date(Date.now() - 20 * 60_000)); // issued 20 min ago, 15-min TTL
    expect(await consumeLinkToken(new URL(expired!.url).searchParams.get("start")!)).toBeNull();
    expect(await consumeLinkToken("not a token")).toBeNull();
  });

  it("webhook update: /start <token> links the private chat; group chats and bad tokens don't", async () => {
    const replies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      expect(String(url)).toContain("/sendMessage"); // only replies; mocked
      replies.push(JSON.parse(String(init?.body)).text);
      return Response.json({ ok: true, result: { message_id: 1 } });
    });
    const link = await createLinkToken(fan);
    const token = new URL(link!.url).searchParams.get("start")!;
    expect(await handleTelegramUpdate({ message: { chat: { id: chatId, type: "group" }, text: `/start ${token}` } })).toBe("ignored");
    expect(await handleTelegramUpdate({ message: { chat: { id: chatId, type: "private" }, text: "/start bogus_token_value_123" } })).toBe("invalid_token");
    expect(await handleTelegramUpdate({ message: { chat: { id: chatId, type: "private" }, from: { username: "test_fan" }, text: `/start ${token}` } })).toBe(
      "linked",
    );
    expect(await telegramLinkOf(fan)).toMatchObject({ chatId: String(chatId), username: "test_fan" });
    expect(await telegramLinkOf(other)).toBeNull();
    expect(replies.some((r) => r.startsWith("Connected"))).toBe(true);
  });

  it("Telegram delivery: queued for a linked profile, 'sent' only on Telegram's OK; blocked bot → failed_permanent", async () => {
    const sent: Array<{ chat: string; text: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const b = JSON.parse(String(init?.body));
      sent.push({ chat: String(b.chat_id), text: b.text });
      return Response.json({ ok: true, result: { message_id: 77 } });
    });
    const sql = getSql();
    const id = await createNotificationRecord(
      { userId: fan, eventId, changeId: null, category: "new_show", priority: "normal", title: "TEST new show", body: "b", reason: "TEST", dedupeKey: `test:${RUN}:tg`, snapshot: null },
      await channelPrefsOf(fan),
    );
    expect(id).not.toBeNull();
    // Same dedupe key again → nothing new.
    expect(
      await createNotificationRecord(
        { userId: fan, eventId, changeId: null, category: "new_show", priority: "normal", title: "TEST new show", body: "b", reason: "TEST", dedupeKey: `test:${RUN}:tg`, snapshot: null },
        await channelPrefsOf(fan),
      ),
    ).toBeNull();
    await deliverPending(undefined, 5, id!);
    const [d] = await sql<{ status: string; provider_message_id: string }[]>`
      select status, provider_message_id from radar.notification_deliveries where notification_id = ${id!} and channel = 'telegram'`;
    expect(d).toMatchObject({ status: "sent", provider_message_id: "77" });
    expect(sent).toEqual([{ chat: String(chatId), text: expect.stringContaining("TEST new show") }]);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: false, description: "Forbidden: bot was blocked by the user" }, { status: 403 }));
    const id2 = await createNotificationRecord(
      { userId: fan, eventId, changeId: null, category: "new_show", priority: "normal", title: "TEST 2", body: "b", reason: "TEST", dedupeKey: `test:${RUN}:tg2`, snapshot: null },
      await channelPrefsOf(fan),
    );
    await deliverPending(undefined, 5, id2!);
    const [d2] = await sql<{ status: string }[]>`select status from radar.notification_deliveries where notification_id = ${id2!} and channel = 'telegram'`;
    expect(d2?.status).toBe("failed_permanent");
  });

  /* ---------------- Bookings ---------------- */

  it("explicit booking is idempotent and owner-only", async () => {
    const a = await saveBooking(fan, eventId);
    const b = await saveBooking(fan, eventId); // double click / retry
    expect(a.ok && a.created).toBe(true);
    expect(b.ok && b.created).toBe(false);
    expect(a.ok && b.ok && a.booking.id === b.booking.id).toBe(true);
    expect(a.ok && a.booking.status).toBe("user_confirmed");
    const [count] = await getSql()<{ n: number }[]>`select count(*)::int as n from radar.bookings where user_id = ${fan} and event_id = ${eventId}`;
    expect(count?.n).toBe(1);
    // Another profile can neither read nor delete it.
    const id = a.ok ? a.booking.id : "";
    expect(await getBooking(other, id)).toBeNull();
    expect(await deleteBooking(other, id)).toEqual({ deleted: false, calendarRemoved: null });
    expect(await listBookings(other)).toEqual([]);
    expect((await listBookings(fan)).map((x) => x.id)).toEqual([id]);
    // Unknown event → refused, nothing saved.
    expect(await saveBooking(fan, randomUUID())).toMatchObject({ ok: false, code: "not_found" });
  });

  it("calendar not connected → booking kept, status not_connected; notification says so (one per booking)", async () => {
    const sql = getSql();
    const [b] = await listBookings(fan);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, result: { message_id: 5 } }));
    const synced = await syncBookingCalendar(fan, b!.id);
    expect(synced?.calendar.status).toBe("not_connected");
    await notifyBooking(fan, synced!);
    await notifyBooking(fan, synced!); // repeat → deduped
    const rows = await sql<{ body: string }[]>`select body from radar.notifications where user_id = ${fan} and dedupe_key = ${`booking:${b!.id}`}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain("Connect Google Calendar");
    expect(rows[0]!.body).toContain("not verified with the ticket seller");
    // The Telegram confirmation was attempted (mocked) and only after the outcome was known.
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("/sendMessage"))).toBe(true);
  });

  it("calendar connected: creates once; retry → 409 path, no duplicate; 401 → needs_reauth, booking kept", async () => {
    const sql = getSql();
    const [b] = await listBookings(fan);
    await sql`insert into radar.google_calendar_connections (user_id, refresh_token_enc, access_token_enc, access_expires_at, scope)
              values (${fan}, ${encryptSecret("TEST-refresh")}, ${encryptSecret("TEST-access")}, now() + interval '1 hour',
                      'https://www.googleapis.com/auth/calendar.events')`;
    const posts: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Response.json({ id: `lsr${b!.id.replace(/-/g, "")}`, htmlLink: "https://calendar.google.com/event?eid=TEST" });
      }
      throw new Error(`unexpected ${String(url)}`);
    });
    const r1 = await syncBookingCalendar(fan, b!.id);
    expect(r1?.calendar).toMatchObject({ status: "synced", htmlLink: "https://calendar.google.com/event?eid=TEST" });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: `lsr${b!.id.replace(/-/g, "")}`, start: { date: `${nextYear}-06-20` } });
    // Already synced → no further API calls.
    await syncBookingCalendar(fan, b!.id);
    expect(posts).toHaveLength(1);

    // Simulate a lost response: status back to failed; Google answers 409 for the same id → fetched, not duplicated.
    await sql`update radar.bookings set calendar_status = 'failed' where id = ${b!.id}`;
    vi.restoreAllMocks();
    const methods: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      methods.push(init?.method ?? "GET");
      return init?.method === "POST"
        ? new Response("{}", { status: 409 })
        : Response.json({ id: `lsr${b!.id.replace(/-/g, "")}`, status: "confirmed", htmlLink: "https://calendar.google.com/event?eid=TEST" });
    });
    expect((await syncBookingCalendar(fan, b!.id))?.calendar.status).toBe("synced");
    expect(methods).toEqual(["POST", "GET"]);

    // Revoked access → needs_reauth; the booking itself is untouched.
    await sql`update radar.bookings set calendar_status = 'failed' where id = ${b!.id}`;
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    expect((await syncBookingCalendar(fan, b!.id))?.calendar.status).toBe("needs_reauth");
    const [conn] = await sql<{ status: string }[]>`select status from radar.google_calendar_connections where user_id = ${fan}`;
    expect(conn?.status).toBe("needs_reauth");
    expect(await getBooking(fan, b!.id)).toMatchObject({ status: "user_confirmed" });
  });

  it("a failed notification never removes the booking", async () => {
    const [b] = await listBookings(fan);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await notifyBooking(fan, { ...b!, id: b!.id }); // deduped anyway; must not throw
    expect(await getBooking(fan, b!.id)).not.toBeNull();
  });

  it("the owner can remove a booking (calendar event removal attempted)", async () => {
    const sql = getSql();
    const [b] = await listBookings(fan);
    await sql`update radar.google_calendar_connections set status = 'connected' where user_id = ${fan}`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    expect(await deleteBooking(fan, b!.id)).toEqual({ deleted: true, calendarRemoved: true });
    expect(await listBookings(fan)).toEqual([]);
  });
});
