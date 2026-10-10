import { getServerEnv } from "@/config/server-env";
import type { SourceClass } from "@/domain/freshness";
import type { AlertTrigger, LiveEvent, LocationPreference } from "@/domain/types";
import { getSql } from "@/server/db";
import { withJobLock } from "@/server/guards";
import { errorMessage, log } from "@/server/log";
import { getEventById } from "@/server/repos/events";
import { emailChannelStatus, recipientAllowed, sendEmail, validateEmail } from "./channels";
import { activeReminderWindow, classifyChange, decide, type ChangeKind, type Decision } from "./decide";

/**
 * Turns stored changes and upcoming deadlines into notifications, then
 * delivers queued ones. Every step is idempotent:
 * - changes are consumed via a cursor (job_cursors) in id order;
 * - notifications are unique per (user, dedupe_key);
 * - deliveries are unique per (notification, channel); email retries reuse
 *   the delivery id as the provider's Idempotency-Key.
 */

export interface NotificationSummary {
  changesScanned: number;
  meaningfulChanges: number;
  notificationsCreated: number;
  duplicatesSkipped: number;
  remindersCreated: number;
  deliveriesSent: number;
  deliveriesFailed: number;
  deliveriesUnavailable: number;
  skipReasons: Record<string, number>;
}

const emptySummary = (): NotificationSummary => ({
  changesScanned: 0,
  meaningfulChanges: 0,
  notificationsCreated: 0,
  duplicatesSkipped: 0,
  remindersCreated: 0,
  deliveriesSent: 0,
  deliveriesFailed: 0,
  deliveriesUnavailable: 0,
  skipReasons: {},
});

interface Follower {
  user_id: string;
  primary_city_id: string | null;
  additional_city_ids: string[] | null;
  include_nationwide: boolean | null;
  alert_triggers: Partial<Record<AlertTrigger, boolean>> | null;
  in_app_enabled: boolean | null;
  email_enabled: boolean | null;
  email_address: string | null;
  saved: boolean;
  muted: boolean;
}

async function followersOf(eventId: string): Promise<Follower[]> {
  const sql = getSql();
  return sql<Follower[]>`
    select ua.user_id, p.primary_city_id, p.additional_city_ids, p.include_nationwide, p.alert_triggers,
           p.in_app_enabled, p.email_enabled, p.email_address,
           exists (select 1 from radar.saved_shows s where s.user_id = ua.user_id and s.event_id = ${eventId}) as saved,
           exists (select 1 from radar.event_mutes m where m.user_id = ua.user_id and m.event_id = ${eventId}) as muted
    from radar.event_artists ea
    join radar.user_artists ua on ua.artist_id = ea.artist_id
    left join radar.user_preferences p on p.user_id = ua.user_id
    where ea.event_id = ${eventId}
    group by ua.user_id, p.user_id`;
}

function locationOf(f: Follower): LocationPreference {
  return {
    primaryCityId: f.primary_city_id ?? "bengaluru",
    additionalCityIds: f.additional_city_ids ?? [],
    includeNationwide: f.include_nationwide ?? true,
  };
}

/** Insert a notification + its deliveries. Returns false when the dedupe key already existed. */
async function createNotification(
  f: Follower,
  event: LiveEvent,
  changeId: number | null,
  d: Extract<Decision, { notify: true }>,
): Promise<boolean> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into radar.notifications (user_id, event_id, change_id, category, priority, title, body, reason, dedupe_key, event_snapshot)
      values (${f.user_id}, ${event.id}, ${changeId}, ${d.category}, ${d.priority}, ${d.title}, ${d.body}, ${d.reason}, ${d.dedupeKey},
              ${tx.json(event as never)})
      on conflict (user_id, dedupe_key) do nothing
      returning id`;
    if (!row) return false;
    const inApp = f.in_app_enabled ?? true;
    await tx`
      insert into radar.notification_deliveries (notification_id, channel, status, sent_at, last_error)
      values (${row.id}, 'in_app', ${inApp ? "delivered" : "unavailable"}, ${inApp ? tx`now()` : null}, ${inApp ? null : "in-app notifications turned off"})`;
    if (f.email_enabled) {
      const address = validateEmail(f.email_address);
      const status = emailChannelStatus();
      const reason = !address
        ? "no valid email address"
        : !status.configured
          ? status.reason
          : !recipientAllowed(address)
            ? "address not on EMAIL_ALLOWED_RECIPIENTS"
            : null;
      await tx`
        insert into radar.notification_deliveries (notification_id, channel, status, next_attempt_at, last_error)
        values (${row.id}, 'email', ${reason ? "unavailable" : "queued"}, ${reason ? null : tx`now()`}, ${reason ?? null})`;
    }
    return true;
  });
}

async function sourceClassOf(eventId: string, sourceId: string): Promise<{ sourceClass: SourceClass; sourceName: string }> {
  const sql = getSql();
  const [row] = await sql<{ cls: SourceClass | null; source_name: string }[]>`
    select record->>'sourceClass' as cls, source_name from radar.event_sources
    where event_id = ${eventId} and source_id = ${sourceId} limit 1`;
  return { sourceClass: row?.cls ?? "user_submitted", sourceName: row?.source_name ?? sourceId };
}

/** Consume new event_changes (cursor) and create notifications for eligible users. */
export async function processChanges(now = new Date(), summary = emptySummary(), batch = 500): Promise<NotificationSummary> {
  const sql = getSql();
  await sql`insert into radar.job_cursors (job) values ('notifications') on conflict do nothing`;
  const [{ last_change_id: cursor } = { last_change_id: 0 }] = await sql<{ last_change_id: number }[]>`
    select last_change_id from radar.job_cursors where job = 'notifications'`;
  const changes = await sql<{ id: number; event_id: string; change_type: string; field: string | null; old_value: unknown; new_value: unknown; source_id: string }[]>`
    select id, event_id, change_type, field, old_value, new_value, source_id
    from radar.event_changes where id > ${cursor} order by id limit ${batch}`;
  summary.changesScanned += changes.length;

  for (const c of changes) {
    const kind = classifyChange(c);
    if (kind) {
      summary.meaningfulChanges++;
      try {
        await notifyFollowers(kind, c.event_id, Number(c.id), c.source_id, c.new_value, c.old_value, now, summary);
      } catch (err) {
        // One bad change must not stall the batch; it is logged and skipped.
        log.error("notifications", "change processing failed", { changeId: String(c.id), error: errorMessage(err) });
      }
    }
    await sql`update radar.job_cursors set last_change_id = ${c.id}, updated_at = now() where job = 'notifications'`;
  }
  return summary;
}

async function notifyFollowers(
  kind: ChangeKind,
  eventId: string,
  changeId: number | null,
  sourceId: string,
  newValue: unknown,
  oldValue: unknown,
  now: Date,
  summary: NotificationSummary,
  reminderWindowHours?: number,
) {
  // Private (pasted) events load as null for an anonymous viewer → never broadcast.
  const event = await getEventById(eventId, null, now);
  if (!event) {
    summary.skipReasons.private_or_missing_event = (summary.skipReasons.private_or_missing_event ?? 0) + 1;
    return;
  }
  const { sourceClass, sourceName } = await sourceClassOf(eventId, sourceId);
  for (const f of await followersOf(eventId)) {
    const d = decide({
      kind,
      event,
      sourceClass,
      sourceName,
      newValue,
      oldValue,
      reminderWindowHours,
      user: {
        triggers: f.alert_triggers ?? {},
        location: locationOf(f),
        followsArtist: true,
        savedEvent: f.saved,
        mutedEvent: f.muted,
      },
      now,
    });
    if (!d.notify) {
      summary.skipReasons[d.skip] = (summary.skipReasons[d.skip] ?? 0) + 1;
      continue;
    }
    const created = await createNotification(f, event, changeId, d);
    if (!created) summary.duplicatesSkipped++;
    else if (kind === "deadline_reminder") summary.remindersCreated++;
    else summary.notificationsCreated++;
  }
}

/** Deadline reminders for verified early-bird deadlines inside a configured window. */
export async function processDeadlineReminders(now = new Date(), summary = emptySummary()): Promise<NotificationSummary> {
  const windows = getServerEnv().reminderWindowsHours;
  if (windows.length === 0) return summary;
  const sql = getSql();
  const maxHours = Math.max(...windows);
  const due = await sql<{ id: string; early_bird_ends_at: Date }[]>`
    select e.id, e.early_bird_ends_at from radar.events e
    where e.ticket_status = 'early_bird' and e.early_bird_ends_at > ${now}
      and e.early_bird_ends_at <= ${new Date(now.getTime() + maxHours * 3_600_000)}`;
  for (const e of due) {
    const window = activeReminderWindow(e.early_bird_ends_at.toISOString(), now, windows);
    if (!window) continue;
    // Use the strongest source that exposes ticket availability as the reminder's evidence.
    const [src] = await sql<{ source_id: string }[]>`
      select source_id from radar.event_sources
      where event_id = ${e.id} and (record->'fields'->>'ticketExposed')::boolean
      order by case record->>'sourceClass' when 'ticketing' then 0 when 'listing' then 1 else 2 end limit 1`;
    if (!src) continue;
    try {
      await notifyFollowers("deadline_reminder", e.id, null, src.source_id, e.early_bird_ends_at.toISOString(), null, now, summary, window);
    } catch (err) {
      log.error("notifications", "reminder failed", { eventId: e.id, error: errorMessage(err) });
    }
  }
  return summary;
}

const MAX_EMAIL_ATTEMPTS = 4;

/** Sends queued/retryable email deliveries. In-app deliveries need no sending. */
export async function deliverPending(summary = emptySummary(), limit = 25): Promise<NotificationSummary> {
  const sql = getSql();
  const pending = await sql<{ id: string; attempts: number; email_address: string | null; title: string; body: string; reason: string }[]>`
    select d.id, d.attempts, p.email_address, n.title, n.body, n.reason
    from radar.notification_deliveries d
    join radar.notifications n on n.id = d.notification_id
    left join radar.user_preferences p on p.user_id = n.user_id
    where d.channel = 'email' and d.status in ('queued', 'failed') and (d.next_attempt_at is null or d.next_attempt_at <= now())
    order by d.created_at limit ${limit}`;
  for (const d of pending) {
    const to = validateEmail(d.email_address);
    const result = to
      ? await sendEmail({ deliveryId: d.id, to, subject: d.title, text: `${d.title}\n\n${d.body}\n\nWhy you're seeing this: ${d.reason}\n\n— Live Show Radar` })
      : ({ ok: false, retryable: false, error: "no valid email address" } as const);
    const attempts = d.attempts + 1;
    if (result.ok) {
      summary.deliveriesSent++;
      await sql`update radar.notification_deliveries set status = 'sent', attempts = ${attempts}, last_attempt_at = now(),
                sent_at = now(), provider_message_id = ${result.providerMessageId}, last_error = null where id = ${d.id}`;
    } else {
      const permanent = !result.retryable || attempts >= MAX_EMAIL_ATTEMPTS;
      summary.deliveriesFailed++;
      // Exponential backoff: 5, 10, 20 minutes.
      const next = permanent ? null : new Date(Date.now() + 5 * 60_000 * 2 ** (attempts - 1));
      await sql`update radar.notification_deliveries set status = ${permanent ? "failed_permanent" : "failed"}, attempts = ${attempts},
                last_attempt_at = now(), next_attempt_at = ${next}, last_error = ${result.error} where id = ${d.id}`;
    }
  }
  return summary;
}

/** All notification work, under one lock so overlapping runs can't double-process. */
export async function runNotificationPipeline(now = new Date()) {
  return withJobLock("notifications", 240, async () => {
    const summary = emptySummary();
    await processChanges(now, summary);
    await processDeadlineReminders(now, summary);
    await deliverPending(summary);
    return summary;
  });
}
