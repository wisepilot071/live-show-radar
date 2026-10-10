# Live Show Radar

Live Show Radar is a concert discovery and alert app for India, with Bengaluru first. You follow artists. The app watches real event sources on a schedule and tells you in an in-app inbox when one of your artists announces a show near you, when a show you care about changes, or when a **verified** early-bird deadline is about to close.

Its core rule is **trust**. Every date, venue and ticket detail is labelled with its source and how fresh it is. The app never invents concerts, ticket availability or urgency.

**Status:** Parts 1–5 implemented, with the limitations listed below.

## Features

- **Onboarding.** Pick artists through a live MusicBrainz search, then set your cities and alert triggers. Your profile lives on the server and is tied to an anonymous signed cookie. If no database is configured, the app falls back to browser storage.
- **Radar dashboard.** Shows real events for the artists you follow, with source evidence, verification and freshness labels, possible-duplicate notes, and saved shows.
- **Paste an announcement.** Gemini Flash pulls structured details out of announcement text you paste in. Every field is checked against the text you pasted. Pasted events are private to you and are never shown as "verified".
- **Scheduled monitoring.** Vercel Cron runs `/api/cron/monitor` daily. It checks sources for the artists that are due, records field-level changes, and runs the notification pipeline.
- **Notifications.**
  - A deterministic decision engine decides what to send: follows, mutes, location scope, triggers, verification, deadline windows.
  - Duplicates are prevented by a per-user dedupe key.
  - You get an in-app inbox with read/unread, mute-this-show and a real unread badge.
  - Early-bird reminders go out 72h and 24h before **verified** deadlines only.
- **Email channel** (Resend). Built, with retries, backoff and idempotency. It is limited to an allow-list and is **not configured** in this deployment because no Resend key is set.
- **Operator view.** `GET /api/admin/status` (bearer token) shows the last runs, per-source outcomes and delivery counts.

## Architecture

The full Components Map (9 layers and 4 Mermaid diagrams) is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
Browser (Next.js App Router UI) → API route handlers (server only) → server modules
  ├─ ingest (normalize → dedupe/upsert → event_changes)   ← MusicBrainz / Ticketmaster* / Bandsintown*
  ├─ announcements (Gemini Flash, grounded)
  ├─ notifications (decide → notifications + deliveries → in-app / email*)
  └─ Supabase Postgres (schema radar, RLS, least-privilege role)
Vercel Cron (daily) → /api/cron/monitor → discovery + notification pipeline
* built but not configured
```

## Stack

- Next.js 16 (App Router), React 19, TypeScript (strict)
- Tailwind CSS v4 and lucide-react
- `postgres` (Supabase Postgres via the pooler), `zod` v4 and `@google/genai` (Gemini only)
- Vitest and ESLint (`eslint-config-next`)

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3003
```

Requires Node 20 or later. With no environment variables at all, the app still runs: your radar is kept in browser storage, and server features show as "not configured", never as working.

## Environment variables

Every variable is server-only, and none uses the `NEXT_PUBLIC_` prefix. See [.env.example](.env.example) for the full annotated list.

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Server profiles, inbox, monitoring. Use `:6543` (transaction pooler) on Vercel and `:5432` locally |
| `SESSION_SECRET` | Signing the anonymous profile cookie |
| `CRON_SECRET` | Authorising Vercel Cron calls to `/api/cron/monitor` |
| `DISCOVERY_ADMIN_TOKEN` | Operator endpoints `/api/admin/*` |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Announcement extraction |
| `MUSICBRAINZ_CONTACT` | User-Agent contact that MusicBrainz asks for |
| `TICKETMASTER_API_KEY`, `BANDSINTOWN_APP_ID` | Optional extra sources (untested; no keys) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ALLOWED_RECIPIENTS` | Optional email channel |
| `REMINDER_WINDOWS_HOURS` | Reminder windows (default `72,24`) |

## Database and migrations

1. Run `npm run db:create-role -- <supabase-ref> <pooler-host>`. The password is generated locally; run the printed SQL (it contains only a SCRAM hash) in Supabase.
2. Run `MIGRATION_DATABASE_URL=<admin connection string> npm run db:migrate` to apply `db/migrations/0001`–`0004` in order. Applied migrations are recorded in `public.lsr_schema_migrations`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3003 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | All tests |
| `npm run test:unit` | Pure unit tests (no network, no database) |
| `npm run test:integration` | Runs against the real database using isolated TEST records, which are deleted afterwards. Skipped if `DATABASE_URL` is unset |

## Scheduler, notifications and operations

- **Cron.** `vercel.json` schedules `GET /api/cron/monitor` at `30 1 * * *` (07:00 IST). The Vercel Hobby plan allows at most one cron run per day. Without the `Authorization: Bearer $CRON_SECRET` header, the route returns 401.
- **Manual run:** `POST /api/admin/discovery` with `Authorization: Bearer $DISCOVERY_ADMIN_TOKEN`.
- **Status:** `GET /api/admin/status` with the same token, or the public `GET /api/integrations/status`.
- **Delivery statuses:**
  - in-app `delivered` means it is stored in your inbox
  - email `sent` means the provider accepted it (not proof it was delivered)
  - `failed` is retried with backoff, up to 4 attempts
  - `failed_permanent` and `unavailable` are final

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the Vercel setup, environment variables, the cron check and the submission checklist.

## Security

- **Secrets:** read only in `src/config/server-env.ts`, never sent to the client, never committed.
- **Database:** a least-privilege role, with RLS on every table.
- **Requests:** same-origin checks on writes, zod validation and size caps on every input, and Postgres-backed rate limits.
- **Outbound and links:** the app only fetches allowlisted https hosts and never follows redirects. User-supplied URLs are never fetched.
- **Headers:** security headers are set in `next.config.ts`.

## Known limitations

- **Very few real Indian events.** MusicBrainz is the only live source, and it lists few upcoming Indian shows, so an empty radar is often the truthful result. Ticketmaster and Bandsintown adapters exist but have no keys and are untested against the live APIs.
- **Email is not configured.** No Resend key or verified sender is set. In-app is the only active channel. Telegram, push and WhatsApp aren't built.
- **Anonymous identity.** Your profile is tied to one browser cookie, with no accounts and no cross-device sync.
- **Daily monitoring only** on Vercel Hobby, and Vercel may run the job at any point within the scheduled hour.
- **Duplicate detection** matches on the headliner (artist, date and city). Line-up level matching isn't implemented.
- **Spotify import** is planned and not built.

## Docs

- [Architecture and Components Map](docs/ARCHITECTURE.md)
- [Deployment and submission checklist](docs/DEPLOYMENT.md)
- [Parts 4–5 checkpoint](docs/PART4-5-CHECKPOINT.md)
- Earlier checkpoints: [Part 1](docs/PART1-CHECKPOINT.md), [Part 2](docs/PART2-CHECKPOINT.md), [Part 3](docs/PART3-CHECKPOINT.md)
