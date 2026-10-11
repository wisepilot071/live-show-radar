-- 0005: Telegram linking, explicit booking confirmations, Google Calendar connections.
-- Additive and backward compatible: no existing column or row is changed or removed;
-- two CHECK constraints are widened (new allowed values only).

-- Telegram as a notification channel (on by default once a chat is linked).
alter table radar.user_preferences
  add column if not exists telegram_enabled boolean not null default true;

alter table radar.notifications drop constraint if exists notifications_category_check;
alter table radar.notifications add constraint notifications_category_check
  check (category in ('new_show', 'ticket_update', 'deadline_reminder', 'event_changed', 'cancelled', 'booking_confirmed'));

alter table radar.notification_deliveries drop constraint if exists notification_deliveries_channel_check;
alter table radar.notification_deliveries add constraint notification_deliveries_channel_check
  check (channel in ('in_app', 'email', 'telegram'));

-- One Telegram chat per profile (and one profile per chat).
create table if not exists radar.telegram_links (
  user_id     uuid primary key references radar.users(id) on delete cascade,
  chat_id     bigint not null unique,
  username    text,
  linked_at   timestamptz not null default now()
);

-- Short-lived, single-use link tokens. Only a SHA-256 hash is stored.
create table if not exists radar.telegram_link_tokens (
  token_hash  text primary key,
  user_id     uuid not null references radar.users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists telegram_link_tokens_user_idx on radar.telegram_link_tokens (user_id);

-- Bookings are recorded only when the user explicitly confirms them.
-- 'user_confirmed' = the user says they bought a ticket; 'provider_verified'
-- is reserved for a future authorised ticketing integration (never set today).
create table if not exists radar.bookings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references radar.users(id) on delete cascade,
  event_id            uuid not null references radar.events(id) on delete cascade,
  status              text not null default 'user_confirmed' check (status in ('user_confirmed', 'provider_verified')),
  confirmed_at        timestamptz not null default now(),
  calendar_status     text not null default 'not_connected'
                        check (calendar_status in ('not_connected', 'pending', 'synced', 'failed', 'needs_reauth')),
  calendar_event_id   text,
  calendar_html_link  text,
  calendar_error      text,
  calendar_attempts   integer not null default 0,
  calendar_synced_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, event_id)
);
create index if not exists bookings_user_idx on radar.bookings (user_id, confirmed_at desc);

-- Google Calendar OAuth tokens, encrypted at rest (AES-256-GCM, app-side key).
create table if not exists radar.google_calendar_connections (
  user_id            uuid primary key references radar.users(id) on delete cascade,
  refresh_token_enc  text,
  access_token_enc   text,
  access_expires_at  timestamptz,
  scope              text not null,
  status             text not null default 'connected' check (status in ('connected', 'needs_reauth')),
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['telegram_links', 'telegram_link_tokens', 'bookings', 'google_calendar_connections'] loop
    execute format('alter table radar.%I enable row level security', t);
    execute format('drop policy if exists app_all on radar.%I', t);
    execute format('create policy app_all on radar.%I for all to lsr_app using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on radar.%I to lsr_app', t);
    execute format('revoke all on radar.%I from anon, authenticated', t);
  end loop;
end $$;
