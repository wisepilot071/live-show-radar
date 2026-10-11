-- Email double opt-in: alerts go only to an address its owner confirmed via an emailed link.
-- "Verified" means email_verified_address equals the current email_address, so changing the
-- address automatically requires a new confirmation. Only a hash of the link token is stored.
alter table radar.user_preferences
  add column if not exists email_verified_address text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verify_token_hash text,
  add column if not exists email_verify_expires_at timestamptz,
  add column if not exists email_verify_sent_at timestamptz;

create unique index if not exists user_preferences_email_verify_token_idx
  on radar.user_preferences (email_verify_token_hash) where email_verify_token_hash is not null;
