-- Phase A fix (P0): events created from a user's pasted announcement must be
-- private to that user. Before this, they lived in the shared events table and
-- could appear on other users' radars (with the submitter's source link).
--
-- event_sources.submitted_by marks a user-submitted evidence row. An event
-- that has any such row is visible only to that submitter, and is never
-- merged with other events (see src/server/ingest/upsert.ts).

alter table radar.event_sources
  add column if not exists submitted_by uuid references radar.users(id) on delete cascade;

create index if not exists event_sources_submitted_by_idx on radar.event_sources (submitted_by);

-- Backfill existing pasted-announcement rows from the announcements log.
update radar.event_sources s
set submitted_by = a.user_id
from radar.announcements a
where s.source_id = 'announcement' and a.event_id = s.event_id and s.submitted_by is null;
