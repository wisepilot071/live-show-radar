import { getSql } from "@/server/db";
import { ok } from "@/server/http";
import { meReadRoute } from "@/server/me";

/** The caller's in-app inbox: only notifications actually delivered in-app. */
export const GET = meReadRoute("api/me/notifications", async (_req, userId) => {
  if (!userId) return ok({ notifications: [], unread: 0 });
  const sql = getSql();
  const notifications = await sql`
    select n.id, n.event_id, n.category, n.priority, n.title, n.body, n.reason, n.created_at, n.read_at, n.is_test,
      n.event_snapshot->'artistNames'->>0 as artist, n.event_snapshot->>'cityName' as city,
      n.event_snapshot->'when'->>'date' as event_date,
      exists (select 1 from radar.event_mutes m where m.user_id = n.user_id and m.event_id = n.event_id) as muted,
      (select json_agg(json_build_object('channel', d.channel, 'status', d.status, 'sentAt', d.sent_at, 'error', d.last_error))
         from radar.notification_deliveries d where d.notification_id = n.id) as deliveries
    from radar.notifications n
    join radar.notification_deliveries ia on ia.notification_id = n.id and ia.channel = 'in_app' and ia.status = 'delivered'
    where n.user_id = ${userId}
    order by n.created_at desc
    limit 100`;
  const [row] = await sql<{ unread: number }[]>`
    select count(*)::int as unread from radar.notifications n
    join radar.notification_deliveries ia on ia.notification_id = n.id and ia.channel = 'in_app' and ia.status = 'delivered'
    where n.user_id = ${userId} and n.read_at is null`;
  return ok({ notifications, unread: row?.unread ?? 0 });
});
