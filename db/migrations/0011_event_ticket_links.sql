-- Ticket pages found by web search for shows whose source gave no ticket link.
-- Kept apart from radar.events so a later re-ingest of the event (which rebuilds
-- its fields from the sources) can't erase a link found this way.
-- url is null when a search found nothing; checked_at paces re-checks.
create table if not exists radar.event_ticket_links (
  event_id    uuid primary key references radar.events (id) on delete cascade,
  url         text,
  found_via   text not null default 'web_search' check (found_via in ('web_search')),
  found_at    timestamptz,
  checked_at  timestamptz not null default now()
);
create index if not exists event_ticket_links_checked_idx on radar.event_ticket_links (checked_at);
grant select, insert, update, delete on radar.event_ticket_links to lsr_app;
