# Deployment and submission checklist

## Current state (2026-10-11)

| Item | State | Evidence |
|---|---|---|
| GitHub repo | ✅ pushed | https://github.com/wisepilot071/live-show-radar, `main` at `710291a` or later (`git ls-remote origin main`) |
| Production build | ✅ | `next build` succeeds locally (Turbopack and webpack) |
| Vercel production | ✅ deployed | https://live-show-radar.vercel.app (`dpl_47WBVbbMrhXMUX7ugS3z2hh4MzvG`, `bom1`). Deployed with the Vercel CLI (`vercel deploy --prod`); env vars set with `scripts/vercel-env-push.mjs` |
| Cron | ✅ registered | `vercel crons ls` shows `/api/cron/monitor` at `30 1 * * *`. A production call with `CRON_SECRET` returned 200 and recorded a `job_runs` row. First automatic run: 2026-10-11 07:00 IST |
| Database | ✅ live | Supabase `live-show-radar` (ap-south-1), migrations 0001–0004 applied |

## How it was deployed (repeatable)

**1. Log in and link the project.**

```bash
npx vercel login
npx vercel link --yes --project live-show-radar
```

**2. Push the environment variables without printing them.** The script reads `.env.local`, switches `DATABASE_URL` to the transaction pooler on `:6543`, and sends each value through stdin as a *sensitive* variable.

```bash
node scripts/vercel-env-push.mjs production
```

**3. Deploy to production.**

```bash
npx vercel deploy --prod
```

Alternatively, import `wisepilot071/live-show-radar` in the Vercel dashboard (framework: Next.js, no overrides). Pushes to `main` will then deploy automatically.

**4. Verify the deployment.** Replace `<url>` with the real deployment URL.

| Check | Expected result |
|---|---|
| `GET <url>/` | 200 |
| `GET <url>/api/integrations/status` | `database.configured: true`, in-app `active`, email not configured, scheduler configured |
| Open `<url>/onboarding` | Complete it, reload `/radar`: your artists are still there (server mode) |
| `GET <url>/api/cron/monitor` with no header | **401** |
| `GET <url>/api/admin/status` with `Authorization: Bearer $DISCOVERY_ADMIN_TOKEN` | 200, aggregates only |
| Vercel → Project → Settings → Cron Jobs | `/api/cron/monitor` at `30 1 * * *`. Use "Run" once, then check `/api/admin/status` for `lastRun` |
| Runtime logs | No errors from `db` |

## Environment variables (all server-only)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `lsr_app` role, **`:6543`** transaction pooler, `sslmode=require` |
| `SESSION_SECRET` | yes | 32+ random bytes |
| `CRON_SECRET` | yes | Vercel sends it as a bearer token to cron routes |
| `DISCOVERY_ADMIN_TOKEN` | yes | Operator endpoints |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | for announcement extraction | Gemini only |
| `MUSICBRAINZ_CONTACT` | recommended | User-Agent contact |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ALLOWED_RECIPIENTS` | optional | Email stays "not configured" unless all three are set |

## Submission checklist

- [x] Source on GitHub, public, with no secrets (diff scanned before the push; `.env*.local` and `.claude/` are ignored)
- [x] README covers setup, environment, migrations, commands, tests, limitations and security
- [x] Components Map with 9 layers and 4 diagrams (`docs/ARCHITECTURE.md`)
- [x] `npm run lint`, `npm run typecheck`, `npm test` (86 tests) and `npm run build` all pass
- [x] Accessibility: axe WCAG 2.1 A/AA reports 0 violations on 11 pages. Responsive at 320, 390 and 768 px
- [x] Cron configured in `vercel.json` (daily, Hobby limit) and protected by `CRON_SECRET`
- [x] Vercel deployment live and verified (routes, DB, cron, auth, logs)
- [ ] Email channel configured (needs a Resend key and a verified sender domain)
- [ ] Ticketmaster and Bandsintown keys (optional)
