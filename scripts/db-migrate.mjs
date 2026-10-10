#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql in order, once each, recording them in
 * public.lsr_schema_migrations. Needs an ADMIN connection string (the
 * Supabase `postgres` user — not the app's lsr_app role), passed via
 * MIGRATION_DATABASE_URL so it never sits in the app's runtime env:
 *
 *   MIGRATION_DATABASE_URL=postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres npm run db:migrate
 *
 * Note: 0002_app_role.sql expects `npm run db:create-role` to have created lsr_app first.
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("Set MIGRATION_DATABASE_URL (admin connection string).");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
await sql`create table if not exists public.lsr_schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
await sql`alter table public.lsr_schema_migrations enable row level security`;
const done = new Set((await sql`select name from public.lsr_schema_migrations`).map((r) => r.name));
const dir = new URL("../db/migrations/", import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  console.log(`applying ${file}`);
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(new URL(file, dir), "utf8"));
    await tx`insert into public.lsr_schema_migrations (name) values (${file})`;
  });
}
console.log("migrations up to date");
await sql.end();
