-- 0006: curated artist catalogue support. Additive and backward compatible.
-- - radar.artists.category: 'international' | 'indian' (null for artists users add themselves)
-- - origin 'curated': a catalogue artist with no external id (never invented)
-- - radar.curated_artist_lists: named lists of catalogue artists (suggestions,
--   discovery test targets), kept SEPARATE from user follows (radar.user_artists)

alter table radar.artists add column if not exists category text
  check (category in ('international', 'indian'));

alter table radar.artists drop constraint if exists artists_origin_check;
alter table radar.artists add constraint artists_origin_check
  check (origin in ('sample_catalogue', 'user_entered', 'musicbrainz', 'spotify', 'event_source', 'curated'));

create table if not exists radar.curated_artist_lists (
  list_key    text not null check (list_key in ('karan_watchlist_suggestions', 'bengaluru_discovery_test')),
  position    integer not null check (position between 1 and 500),
  entry_name  text not null,
  artist_id   uuid not null references radar.artists(id) on delete restrict,
  primary key (list_key, position)
);
create index if not exists curated_artist_lists_artist_idx on radar.curated_artist_lists (artist_id);

alter table radar.curated_artist_lists enable row level security;
drop policy if exists app_all on radar.curated_artist_lists;
create policy app_all on radar.curated_artist_lists for all to lsr_app using (true) with check (true);
grant select, insert, update, delete on radar.curated_artist_lists to lsr_app;
revoke all on radar.curated_artist_lists from anon, authenticated;
