/**
 * Part 4 end-to-end against the database with ISOLATED TEST records:
 * random TEST users, a test:-prefixed artist, and fixture sources
 * ("test_fixture_*"). External email HTTP is mocked — nothing is ever sent.
 * Everything created is deleted in afterAll.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HAS_DB } from "./setup-env";
import type { AdapterOutcome, EventSourceAdapter, SourceEventRecord } from "@/integrations/events/contract";
import { getSql } from "@/server/db";
import { runDiscovery } from "@/server/ingest/pipeline";
import { deliverPending, processDeadlineReminders, runNotificationPipeline } from "@/server/notifications/process";
import { fixtureRecord } from "../fixtures/source-records";

const RUN = randomUUID().slice(0, 8);
const fan = randomUUID(); // follows the artist, default prefs
const quiet = randomUUID(); // follows the artist, new-show alerts OFF
const stranger = randomUUID(); // doesn't follow
const artistId = randomUUID();
const artistName = `TEST Notify Band ${RUN}`;
const nextYear = new Date().getUTCFullYear() + 1;

let current: SourceEventRecord[] = [];
function fixtureSource(id: string, sourceClass: "listing" | "ticketing"): EventSourceAdapter {
  return {
    id,
    name: `TEST ${id}`,
    sourceClass,
    configStatus: () => ({ configured: true }),
    canLookUp: () => true,
    fetchForArtists: async (): Promise<AdapterOutcome> => ({ ok: true, records: current, checkedArtistIds: [artistId], artistFailures: [] }),
  };
}
const listing = fixtureSource(`test_fixture_listing_${RUN}`, "listing");
const ticketing = fixtureSource(`test_fixture_ticketing_${RUN}`, "ticketing");

const show = (o: Partial<SourceEventRecord> = {}) =>
  fixtureRecord({ sourceEventId: `TEST-${RUN}-show`, performers: [{ name: artistName }], localDate: `${nextYear}-03-14`, ...o });

async function discover(source: EventSourceAdapter) {
  await getSql()`delete from radar.artist_source_checks where artist_id = ${artistId}`; // make the artist due again
  return runDiscovery({ trigger: "admin", sources: [source] });
}

async function notificationsFor(userId: string) {
  return getSql()<{ category: string; priority: string; dedupe_key: string; reason: string }[]>`
    select category, priority, dedupe_key, reason from radar.notifications where user_id = ${userId} order by created_at`;
}

describe.skipIf(!HAS_DB)("notifications end-to-end (isolated TEST records)", () => {
  beforeAll(async () => {
    const sql = getSql();
    await sql`insert into radar.users (id) values (${fan}), (${quiet}), (${stranger})`;
    await sql`insert into radar.artists (id, catalogue_key, name, origin) values (${artistId}, ${`test:${RUN}`}, ${artistName}, 'event_source')`;
    await sql`insert into radar.user_artists (user_id, artist_id, added_via) values (${fan}, ${artistId}, 'manual'), (${quiet}, ${artistId}, 'manual')`;
    await sql`insert into radar.user_preferences (user_id, alert_triggers) values (${quiet}, ${sql.json({ new_announcement: false })})`;
    // Consume any pre-existing changes so this test only sees its own.
    await runNotificationPipeline();
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    const sql = getSql();
    await sql`delete from radar.events e using radar.event_artists ea where ea.event_id = e.id and ea.artist_id = ${artistId}`;
    await sql`delete from radar.ingestion_runs where source_id like ${"test_fixture_%_" + RUN}`;
    await sql`delete from radar.users where id in (${fan}, ${quiet}, ${stranger})`;
    await sql`delete from radar.artists where id = ${artistId}`;
    await sql.end({ timeout: 2 });
    globalThis.__lsrSql = undefined;
  });

  it("Journey 5: a new show creates exactly one alert per eligible user; re-processing creates nothing", async () => {
    current = [show()];
    const run = await discover(listing);
    expect(run.status === "completed" && run.sources[0]?.eventsNew).toBe(1);
    await runNotificationPipeline();
    const fanAlerts = await notificationsFor(fan);
    expect(fanAlerts.map((n) => n.category)).toEqual(["new_show"]);
    expect(fanAlerts[0]?.reason).toContain("artist you follow");
    expect(await notificationsFor(quiet)).toEqual([]); // new-show alerts turned off
    expect(await notificationsFor(stranger)).toEqual([]); // doesn't follow

    // Same source again: no new event, no new alert.
    const again = await discover(listing);
    expect(again.status === "completed" && again.sources[0]?.eventsNew).toBe(0);
    await runNotificationPipeline();
    expect(await notificationsFor(fan)).toHaveLength(1);
    // In-app delivery recorded as delivered (= stored in the inbox).
    const [d] = await getSql()<{ status: string }[]>`
      select d.status from radar.notification_deliveries d join radar.notifications n on n.id = d.notification_id
      where n.user_id = ${fan} and d.channel = 'in_app'`;
    expect(d?.status).toBe("delivered");
  });

  it("Journey 6: a date change alerts once; the same update again alerts nothing", async () => {
    current = [show({ localDate: `${nextYear}-03-15` })];
    await discover(listing);
    await runNotificationPipeline();
    await discover(listing);
    await runNotificationPipeline();
    const changed = (await notificationsFor(fan)).filter((n) => n.category === "event_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]?.dedupe_key).toContain(`:date:${nextYear}-03-15`);
    // The quiet user still gets change alerts (only new-show alerts are off for them).
    expect((await notificationsFor(quiet)).some((n) => n.category === "event_changed")).toBe(true);
  });

  it("Journey 7: deadline reminder only with a verified deadline, exactly once", async () => {
    const soon = new Date(Date.now() + 10 * 3_600_000); // 10h from now
    const endsAt = new Date(soon.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 19) + "+05:30"; // same instant, IST offset
    current = [
      show({
        sourceEventId: `TEST-${RUN}-tm`,
        localDate: `${nextYear}-03-15`,
        ticket: { status: "early_bird", sourceExposesAvailability: true, earlyBirdEndsAt: endsAt },
      }),
    ];
    await discover(ticketing); // same artist/date/city/venue → merges as ticketing evidence
    await runNotificationPipeline();
    await processDeadlineReminders();
    const reminders = (await notificationsFor(fan)).filter((n) => n.category === "deadline_reminder");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.priority).toBe("high");
    expect(reminders[0]?.dedupe_key).toContain(":24h");
    // An early-bird announcement alert was also created once (ticket_update).
    expect((await notificationsFor(fan)).filter((n) => n.category === "ticket_update")).toHaveLength(1);
  });

  it("no reminder when the deadline is missing (status alone isn't a deadline)", async () => {
    const before = (await notificationsFor(fan)).length;
    await getSql()`update radar.events e set early_bird_ends_at = null
                   from radar.event_artists ea where ea.event_id = e.id and ea.artist_id = ${artistId}`;
    await processDeadlineReminders();
    expect(await notificationsFor(fan)).toHaveLength(before);
  });

  it("email: unconfigured → 'unavailable'; configured (mocked HTTP) → retry on 500, then 'sent' with idempotency key", async () => {
    const sql = getSql();
    await sql`insert into radar.user_preferences (user_id, email_enabled, email_address) values (${fan}, true, 'alerts@example.test')
              on conflict (user_id) do update set email_enabled = true, email_address = 'alerts@example.test'`;
    // Not configured: a new alert gets an 'unavailable' email delivery, nothing attempted.
    const saved = { ...process.env };
    delete process.env.RESEND_API_KEY;
    current = [show({ sourceEventId: `TEST-${RUN}-second`, localDate: `${nextYear}-04-01` })];
    await discover(listing);
    await runNotificationPipeline();
    const [unavailable] = await sql<{ status: string; last_error: string }[]>`
      select d.status, d.last_error from radar.notification_deliveries d join radar.notifications n on n.id = d.notification_id
      where n.user_id = ${fan} and d.channel = 'email'`;
    expect(unavailable?.status).toBe("unavailable");

    // Configured with TEST values + mocked provider.
    Object.assign(process.env, { RESEND_API_KEY: "TEST-resend", EMAIL_FROM: "TEST <test@example.test>", EMAIL_ALLOWED_RECIPIENTS: "alerts@example.test" });
    const calls: Array<{ url: string; key: string | null }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), key: new Headers(init?.headers).get("Idempotency-Key") });
      return calls.length === 1 ? new Response("boom", { status: 500 }) : new Response(JSON.stringify({ id: "TEST-msg-1" }), { status: 200 });
    });
    current = [show({ sourceEventId: `TEST-${RUN}-third`, localDate: `${nextYear}-05-01` })];
    await discover(listing);
    await runNotificationPipeline(); // creates 'queued' + first attempt fails (500 → retryable)
    const [failed] = await sql<{ id: string; status: string; attempts: number }[]>`
      select d.id, d.status, d.attempts from radar.notification_deliveries d join radar.notifications n on n.id = d.notification_id
      where n.user_id = ${fan} and d.channel = 'email' and d.status <> 'unavailable'`;
    expect(failed).toMatchObject({ status: "failed", attempts: 1 });
    await sql`update radar.notification_deliveries set next_attempt_at = now() - interval '1 minute' where id = ${failed!.id}`;
    await deliverPending();
    const [sent] = await sql<{ status: string; provider_message_id: string }[]>`
      select status, provider_message_id from radar.notification_deliveries where id = ${failed!.id}`;
    expect(sent).toMatchObject({ status: "sent", provider_message_id: "TEST-msg-1" });
    expect(calls.every((c) => c.url === "https://api.resend.com/emails" && c.key === failed!.id)).toBe(true);
    for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_ALLOWED_RECIPIENTS"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("overlapping runs: while one run holds the lock, another is refused (and nothing is double-processed)", async () => {
    const sql = getSql();
    // Simulate a run in progress by holding the lease the pipeline uses.
    await sql`insert into radar.job_locks (key, holder, expires_at) values ('notifications', 'TEST-holder', now() + interval '1 minute')
              on conflict (key) do update set holder = 'TEST-holder', expires_at = now() + interval '1 minute'`;
    try {
      expect((await runNotificationPipeline()).acquired).toBe(false);
    } finally {
      await sql`delete from radar.job_locks where key = 'notifications' and holder = 'TEST-holder'`;
    }
    expect((await runNotificationPipeline()).acquired).toBe(true);
  });
});
