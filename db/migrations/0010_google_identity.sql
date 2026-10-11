-- Google identity on the Calendar connection, so connecting Google on another
-- device can bring the person back to their existing profile ("sign in with Google").
-- google_sub is Google's stable account id (from the OpenID id_token).
alter table radar.google_calendar_connections
  add column if not exists google_sub text,
  add column if not exists google_email text;
create unique index if not exists google_calendar_connections_sub_idx
  on radar.google_calendar_connections (google_sub) where google_sub is not null;
