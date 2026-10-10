-- Live Show Radar — initial schema (Part 3).
--
-- Everything lives in the `radar` schema, which Supabase does NOT expose
-- through its public REST API. The Next.js server connects as the
-- least-privilege role `lsr_app` (created by 0002) and every user-scoped
-- query is filtered by the caller's user id in application code.
-- RLS is enabled on every table; only `lsr_app` has policies, so the
-- anon/authenticated API roles can read nothing even if the schema is
-- exposed later by mistake.

create schema if not exists radar;

-- ── Users & preferences ──────────────────────────────────────────────
-- No login exists yet: a user is an anonymous profile bound to a signed,
-- httpOnly browser cookie. Real auth (Part 5+) can attach to this row.
create table radar.users (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

create table radar.user_preferences (
  user_id                 uuid primary key references radar.users(id) on delete cascade,
  primary_city_id         text not null default 'bengaluru',
  additional_city_ids     text[] not null default '{}',
  include_nationwide      boolean not null default true,
  alert_triggers          jsonb not null default '{}'::jsonb,
  channel_requests        jsonb not null default '{}'::jsonb,
  acquisition_method      text check (acquisition_method in ('spotify', 'manual', 'mix')),
  spotify_status          text not null default 'not_connected',
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── Artists ──────────────────────────────────────────────────────────
-- catalogue_key is the app's identity key (mbid:…, sample:…, user:…).
-- Same-named artists stay separate rows; nothing merges on name alone.
create table radar.artists (
  id               uuid primary key default gen_random_uuid(),
  catalogue_key    text not null unique,
  name             text not null,
  sort_name        text,
  disambiguation   text,
  country          text,
  genres           text[] not null default '{}',
  aliases          text[] not null default '{}',
  image_url        text,
  musicbrainz_id   uuid unique,
  spotify_id       text unique,
  origin           text not null check (origin in ('sample_catalogue', 'user_entered', 'musicbrainz', 'spotify', 'event_source')),
  source_metadata  jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table radar.user_artists (
  user_id      uuid not null references radar.users(id) on delete cascade,
  artist_id    uuid not null references radar.artists(id) on delete restrict,
  added_via    text not null check (added_via in ('manual', 'spotify')),
  selected_at  timestamptz not null default now(),
  primary key (user_id, artist_id)
);
create index user_artists_artist_idx on radar.user_artists (artist_id);

-- ── Events (canonical) ───────────────────────────────────────────────
-- Nullable wherever a source may legitimately not know the value.
create table radar.events (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  kind                  text not null default 'concert' check (kind in ('concert', 'festival', 'tour_stop')),
  starts_at             timestamptz,
  local_date            date,
  time_zone             text not null,
  venue_name            text,
  venue_key             text,
  city_name             text,
  city_id               text,
  state                 text,
  country_code          text,
  location_confidence   text not null default 'unknown' check (location_confidence in ('matched_city', 'coordinates', 'source_country', 'unknown')),
  ticket_url            text,
  ticket_status         text not null default 'unknown',
  ticket_verification   text not null default 'unavailable',
  ticket_checked_at     timestamptz,
  sale_opens_at         timestamptz,
  early_bird_starts_at  timestamptz,
  early_bird_ends_at    timestamptz,
  event_status          text not null default 'scheduled' check (event_status in ('scheduled', 'cancelled', 'rescheduled', 'unknown')),
  verification_state    text not null default 'unconfirmed',
  announced_at          timestamptz,
  first_discovered_at   timestamptz not null default now(),
  last_checked_at       timestamptz,
  last_verified_at      timestamptz,
  match_key             text,
  needs_review          boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index events_local_date_idx on radar.events (local_date);
create index events_city_idx on radar.events (city_id);
create index events_match_key_idx on radar.events (match_key);

create table radar.event_artists (
  event_id       uuid not null references radar.events(id) on delete cascade,
  artist_id      uuid not null references radar.artists(id) on delete restrict,
  billing_order  int not null default 0,
  primary key (event_id, artist_id)
);
create index event_artists_artist_idx on radar.event_artists (artist_id);

-- One row per (source, source event). Re-ingesting updates this row, so
-- repeated checks never duplicate an event. Evidence stays per source.
create table radar.event_sources (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references radar.events(id) on delete cascade,
  source_id           text not null,
  source_name         text not null,
  source_event_id     text not null,
  source_url          text,
  first_seen_at       timestamptz not null default now(),
  last_checked_at     timestamptz not null default now(),
  last_success_at     timestamptz,
  source_updated_at   timestamptz,
  verification_state  text not null default 'unconfirmed',
  record              jsonb not null,
  content_hash        text not null,
  unique (source_id, source_event_id)
);
create index event_sources_event_idx on radar.event_sources (event_id);

-- Possible duplicates that were deliberately NOT merged.
create table radar.event_match_candidates (
  id          uuid primary key default gen_random_uuid(),
  event_id_a  uuid not null references radar.events(id) on delete cascade,
  event_id_b  uuid not null references radar.events(id) on delete cascade,
  reason      text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (event_id_a, event_id_b),
  check (event_id_a < event_id_b)
);

-- Field-level change log. Written by ingestion now; consumed by Part 4.
create table radar.event_changes (
  id           bigserial primary key,
  event_id     uuid not null references radar.events(id) on delete cascade,
  change_type  text not null,
  field        text,
  old_value    jsonb,
  new_value    jsonb,
  source_id    text not null,
  detected_at  timestamptz not null default now()
);
create index event_changes_event_idx on radar.event_changes (event_id, detected_at desc);

-- ── Saved shows ──────────────────────────────────────────────────────
-- event_key is the canonical event id, or an illustrative example id.
-- The snapshot keeps the card renderable if the event later disappears.
create table radar.saved_shows (
  user_id    uuid not null references radar.users(id) on delete cascade,
  event_key  text not null,
  event_id   uuid references radar.events(id) on delete set null,
  snapshot   jsonb not null,
  saved_at   timestamptz not null default now(),
  primary key (user_id, event_key)
);

-- ── Announcements (pasted text → Gemini extraction) ──────────────────
create table radar.announcements (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references radar.users(id) on delete cascade,
  text_hash        text not null,
  text_excerpt     text not null,
  source_url       text,
  status           text not null check (status in ('extracted', 'not_an_event', 'no_matching_artist', 'ambiguous_artist', 'failed', 'needs_review')),
  event_id         uuid references radar.events(id) on delete set null,
  error_category   text,
  submitted_at     timestamptz not null default now()
);
create index announcements_user_idx on radar.announcements (user_id, submitted_at desc);

-- ── Operations ───────────────────────────────────────────────────────
create table radar.ingestion_runs (
  id                     uuid primary key default gen_random_uuid(),
  source_id              text not null,
  trigger                text not null check (trigger in ('user', 'admin', 'schedule')),
  user_id                uuid references radar.users(id) on delete set null,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed', 'skipped', 'not_configured')),
  error_category         text,
  error_message          text,
  artists_requested      int not null default 0,
  artists_checked        int not null default 0,
  records_returned       int not null default 0,
  events_new             int not null default 0,
  events_updated         int not null default 0,
  duplicate_candidates   int not null default 0,
  records_rejected       int not null default 0
);
create index ingestion_runs_source_idx on radar.ingestion_runs (source_id, started_at desc);
create index ingestion_runs_user_idx on radar.ingestion_runs (user_id, started_at desc);

create table radar.artist_source_checks (
  artist_id            uuid not null references radar.artists(id) on delete cascade,
  source_id            text not null,
  last_attempt_at      timestamptz not null,
  last_success_at      timestamptz,
  last_error_category  text,
  primary key (artist_id, source_id)
);

create table radar.ai_extractions (
  input_hash      text primary key,
  model           text not null,
  prompt_version  text not null,
  status          text not null check (status in ('ok', 'invalid_output', 'failed')),
  output          jsonb,
  error_category  text,
  created_at      timestamptz not null default now()
);

create table radar.job_locks (
  key         text primary key,
  holder      text not null,
  expires_at  timestamptz not null
);

create table radar.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         int not null
);

-- Part 4 will write here; nothing sends notifications in Part 3.
create table radar.notification_deliveries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references radar.users(id) on delete cascade,
  event_id    uuid not null references radar.events(id) on delete cascade,
  change_id   bigint references radar.event_changes(id) on delete set null,
  channel     text not null,
  status      text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (user_id, event_id, change_id, channel)
);

-- ── RLS: deny by default ─────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'radar' loop
    execute format('alter table radar.%I enable row level security', t);
  end loop;
end $$;

revoke all on schema radar from public, anon, authenticated;
revoke all on all tables in schema radar from public, anon, authenticated;
