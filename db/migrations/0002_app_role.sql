-- Least-privilege application role used by the Next.js server.
-- The password is never written here: `npm run db:create-role` generates
-- a random password locally, stores it in .env.local, and sends only a
-- SCRAM-SHA-256 verifier (a one-way hash) to the database.
--
--   create role lsr_app login password 'SCRAM-SHA-256$…';   -- run by the script
--
-- This migration grants that role exactly what the app needs.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lsr_app') then
    raise exception 'Role lsr_app does not exist yet. Run: npm run db:create-role';
  end if;
end $$;

grant usage on schema radar to lsr_app;
grant select, insert, update, delete on all tables in schema radar to lsr_app;
grant usage, select on all sequences in schema radar to lsr_app;
alter default privileges in schema radar grant select, insert, update, delete on tables to lsr_app;
alter default privileges in schema radar grant usage, select on sequences to lsr_app;

-- RLS stays enabled; the app role gets an explicit allow-all policy per
-- table (user scoping is enforced in the query layer by user_id).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'radar' loop
    execute format('drop policy if exists app_all on radar.%I', t);
    execute format('create policy app_all on radar.%I for all to lsr_app using (true) with check (true)', t);
  end loop;
end $$;

alter role lsr_app set search_path = radar, public;
alter role lsr_app set statement_timeout = '15s';
