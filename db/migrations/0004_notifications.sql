-- Part 4: automated discovery, change processing and notifications.

-- Per-user channel settings. Email delivery additionally requires the
-- operator's allowlist (EMAIL_ALLOWED_RECIPIENTS) until double opt-in exists.
alter table radar.user_preferences
  add column if not exists in_app_enabled boolean not null default true,
  add column if not exists email_enabled boolean not null default false,
  add column if not exists email_address text;

-- One row per (user, meaningful thing). dedupe_key makes generation idempotent:
-- re-processing the same change, or a second source confirming the same new
-- show, can never create a second notification.
create table if not exists radar.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references radar.users(id) on delete cascade,
  event_id        uuid references radar.events(id) on delete set null,
  change_id       bigint references radar.event_changes(id) on delete set null,
  category        text not null check (category in ('new_show', 'ticket_update', 'deadline_reminder', 'event_changed', 'cancelled')),
  priority        text not null check (priority in ('high', 'normal')),
  title           text not null,
  body            text not null,
  reason          text not null,
  dedupe_key      text not null,
  event_snapshot  jsonb,
  is_test         boolean not null default false,
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on radar.notifications (user_id, created_at desc);

-- Delivery tracking per channel. Semantics:
--   in_app  'delivered'  = stored in the user's inbox (that IS the delivery)
--   email   'sent'       = the provider ACCEPTED the message (not proof of inbox delivery)
--   'failed' is retried with backoff; 'failed_permanent' is not.
--   'unavailable' = channel not configured / recipient not allowed — nothing was attempted.
drop table if exists radar.notification_deliveries;
create table radar.notification_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  notification_id      uuid not null references radar.notifications(id) on delete cascade,
  channel              text not null check (channel in ('in_app', 'email')),
  status               text not null check (status in ('queued', 'delivered', 'sent', 'failed', 'failed_permanent', 'unavailable')),
  attempts             int not null default 0,
  last_attempt_at      timestamptz,
  next_attempt_at      timestamptz,
  sent_at              timestamptz,
  provider_message_id  text,
  last_error           text,
  created_at           timestamptz not null default now(),
  unique (notification_id, channel)
);
create index if not exists deliveries_pending_idx on radar.notification_deliveries (status, next_attempt_at);

create table if not exists radar.event_mutes (
  user_id     uuid not null references radar.users(id) on delete cascade,
  event_id    uuid not null references radar.events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- Operator visibility for scheduled / manual monitoring runs.
create table if not exists radar.job_runs (
  id              uuid primary key default gen_random_uuid(),
  job             text not null,
  trigger         text not null check (trigger in ('schedule', 'admin', 'user')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed', 'locked')),
  error_category  text,
  summary         jsonb not null default '{}'::jsonb
);
create index if not exists job_runs_job_idx on radar.job_runs (job, started_at desc);

-- Change-processing cursor: event_changes are consumed in id order exactly once
-- (plus the unique dedupe_key as a second line of defence).
create table if not exists radar.job_cursors (
  job             text primary key,
  last_change_id  bigint not null default 0,
  updated_at      timestamptz not null default now()
);

-- RLS + app-role policies for the new tables (deny-by-default for API roles).
do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_deliveries', 'event_mutes', 'job_runs', 'job_cursors'] loop
    execute format('alter table radar.%I enable row level security', t);
    execute format('drop policy if exists app_all on radar.%I', t);
    execute format('create policy app_all on radar.%I for all to lsr_app using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on radar.%I to lsr_app', t);
    execute format('revoke all on radar.%I from anon, authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema radar to lsr_app;
