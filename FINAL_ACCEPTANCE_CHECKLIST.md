# Final Acceptance Checklist: Live Show Radar

**Verified on:** 2026-10-11 (IST)
**Production:** https://live-show-radar.vercel.app (deployment `dpl_47WBVbbMrhXMUX7ugS3z2hh4MzvG`, region `bom1`)
**Repository:** https://github.com/wisepilot071/live-show-radar

**Status key:**
- **PASS**: verified with the evidence shown
- **FAIL**: checked and does not work
- **BLOCKED**: depends on access or credentials we don't have
- **NOT IMPLEMENTED**: deliberately out of scope

**Evidence labels used below:**
- **prod-e2e**: an API journey script run against production on 2026-10-11, using the same calls the UI makes (19/19 passed; the test profile was deleted afterwards)
- **local-browser**: checks in the in-app browser against the dev server
- **tests**: `npm test`

## 11.1 Product and UX

| Requirement | Location | Verification | Actual result | Status |
|---|---|---|---|---|
| Solves the concert-discovery problem (follow artists, find Indian shows, act before windows close) | Whole app; `docs/ARCHITECTURE.md` | Review + journeys | Follow, discover, verify, save, alert, deadline-reminder flow implemented end to end. **Real Indian event coverage is very thin** (see 11.2) | PASS (with limitation) |
| Artist selection works | `ArtistSearchStep`, `/api/artists/search`, `/api/me/artists` | prod-e2e | Live MusicBrainz search returned "Prateek Kuhad" (MBID). Follow persisted; a duplicate follow was a no-op | PASS |
| Manual setup does not need Spotify | `MethodStep`, `SpotifyStep` | local-browser + prod-e2e (`method: manual`) | Full onboarding completes without Spotify. Spotify is shown as not available (not built) | PASS |
| Bengaluru is prioritised per saved preferences | `domain/event-signals.ts` (sort), `LocationStep` | tests ("sorts primary city first"), prod-e2e | Primary city persisted; sorting puts the primary city first | PASS |
| Other Indian cities stay discoverable | Location scope, `decide.ts` | tests (city scope), prod-e2e (Mumbai added) | Additional cities and India-wide scope persist and are honoured | PASS |
| Date, venue, ticket status, source and freshness are understandable | `EventCard`, `EventDetail`, `SourcePanel`, `domain/freshness.ts` | local-browser, tests | Every field carries a source and verification state; unknown ticket status is labelled as unknown | PASS |
| Saved shows persist | `/api/me/saved`, `saved_shows` | tests (integration "saved shows"), local-browser | Save, reload, unsave verified on the real DB. In production, saving an unknown event is refused with 404 (no false success). **Not exercised in production with a real event, because none exist** | PASS (prod: partial) |
| Important changes can be surfaced | `notifications/*`, `/inbox` | tests (Journeys 5–7) | New show, date change and deadline alerts are each created once | PASS |
| Usable when sources fail | `dashboard-view.ts` (9 states), adapters | tests ("outage is a failure, not empty") | Failures are shown as failures; stored events are marked outdated | PASS |
| Notifications avoid noise | `decide.ts` | tests | Only verified, followed, in-scope, enabled triggers. URL-only edits and conflicts are ignored. Priority is not inflated | PASS |
| Signal After Dark design is consistent | `globals.css` tokens | local-browser review | Consistent dark theme with lime and coral tokens | PASS |
| Mobile and desktop work | All pages | local-browser at 320, 390, 768 px and desktop | No overflow or clipped headings | PASS |
| Core actions work | All | prod-e2e + local-browser | Follow, unfollow, preferences, complete, discovery, inbox, channels and delete profile all work | PASS |

## 11.2 External data and AI

| Requirement | Location | Verification | Actual result | Status |
|---|---|---|---|---|
| Actual event sources identified | `integrations/events/*` | Review + research | MusicBrainz (live). Ticketmaster Discovery and Bandsintown (adapters). Indian ticketing platforms (District, BookMyShow, SkillBox, Insider) have **no public API**, so they're not scraped. Songkick's API is closed to new users | PASS |
| Live source requests tested | `musicbrainz.ts` | Real requests from production and locally | Real artist search works in production. Real event lookups succeed but return **0 upcoming Indian events**: a direct MusicBrainz query found only 2 events *ever* in Mumbai/Bengaluru and none upcoming | PASS (request) / **BLOCKED (real Indian event data)** |
| Provider limitations documented | README, ARCHITECTURE §6 | Review | Documented | PASS |
| Normalisation and deduplication work | `ingest/normalize.ts`, `upsert.ts` | tests (unit + integration) | Idempotent re-ingest; same-venue merge; different-venue candidate; private pastes never merge | PASS |
| Unknown data is never invented | normalize, adapters, grounding | tests | Unknown stays unknown; partial dates aren't stored as dates | PASS |
| Ticket status reflects source evidence | `freshness.ts`, adapters | tests | Community sources never confirm availability; `offsale` doesn't mean sold out; ticket status goes stale after 6h | PASS |
| Gemini Flash used server-side | `integrations/gemini/client.ts` | Status endpoint in production | `gemini-3.8-flash` (fallback `gemini-3.6-flash`, Gemini only). Real extraction succeeded earlier (lastSuccessAt 2026-10-10T20:04Z) | PASS |
| AI output validated | `announcement-extraction.ts`, `announcements.ts` | tests | zod schema plus verbatim-evidence grounding; invented values are dropped | PASS |
| AI failures handled safely | client.ts | tests (mocked) | Bounded retries; invalid output reported as an explicit error; no other provider | PASS |
| No Claude API | `package.json`, `src/` | grep | Only `@google/genai` | PASS |

## 11.3 Automation and notifications

| Requirement | Location | Verification | Actual result | Status |
|---|---|---|---|---|
| Scheduler configured correctly | `vercel.json`, `/api/cron/monitor` | `vercel crons ls` | `/api/cron/monitor` at `30 1 * * *` is registered on the production project (Hobby: daily) | PASS |
| Scheduled execution verified | `server/monitoring.ts` | Production call with `CRON_SECRET` (same request Vercel Cron makes) | HTTP 200 in 1.2s; `job_runs` row `succeeded`; visible in `/api/admin/status`. **The first automatic Vercel-triggered run is due 2026-10-11 07:00 IST and hasn't happened yet** | PASS (manual) / pending (automatic) |
| Repeated runs are safe | `guards.ts` leases, cursor | tests (overlap + expired-lease takeover) | A second concurrent run is refused; reprocessing creates nothing | PASS |
| Event changes detected | `upsert.ts`, `classifyChange` | tests (Journey 6) | Date change detected and alerted once | PASS |
| Duplicate notifications prevented | unique `(user_id, dedupe_key)` | tests (Journeys 5–6) | Re-ingesting and re-processing create 0 new notifications | PASS |
| Deadline reminders use reliable timestamps | `activeReminderWindow`, `processDeadlineReminders` | tests (Journey 7 + no-deadline case) | Only a verified deadline with an offset triggers a reminder, exactly once | PASS |
| Preferences enforced | `decide.ts` | tests | Follows, mutes, triggers, city scope | PASS |
| Delivery status reflects provider results | `notification_deliveries`, `channels.ts` | tests (mocked HTTP 500 → retry → `sent`) | `sent` means accepted by the provider; failures are retried with backoff | PASS |
| Missing credentials reported clearly | `/api/integrations/status`, Settings | Production status endpoint | Email: "RESEND_API_KEY is not set". Ticketmaster and Bandsintown keys not set | PASS |
| External channel live | `channels.ts` | — | Email built; **no Resend key or verified sender** | BLOCKED |

## 11.4 Testing

| Check | Command or method | Result | Status |
|---|---|---|---|
| Lint | `npm run lint` | Clean | PASS |
| Type check | `npm run typecheck` | Clean | PASS |
| Unit + integration tests | `npm test` | 86/86 passed (8 files) | PASS |
| Production build | `npm run build` locally + Vercel build (34s) | Both succeed | PASS |
| Database checks | Migrations 0001–0004; Supabase advisors | Applied; 0 advisor findings | PASS |
| External integration checks | Real MusicBrainz and Gemini calls; mocked Ticketmaster | See 11.2 | PASS / BLOCKED (TM/BIT keys) |
| End-to-end journeys, local UI | local-browser | Onboarding to Radar to Inbox to Settings; persisted after reload | PASS |
| End-to-end journeys, production | prod-e2e | 19/19 checks (A, B, security, inbox, channels, discovery, cleanup) | PASS |
| End-to-end, production UI in a browser | In-app browser pane | The pane blocks `*.vercel.app` scripts and styles (`ERR_BLOCKED_BY_CLIENT`, a client policy); all assets return 200 via curl | BLOCKED (tooling) |
| Journey C: real event to Radar | — | No real Indian event exists in any accessible source | BLOCKED |
| Journeys E/F/G (notification, update, deadline) | Integration tests on the real DB with TEST records | Pass, with cleanup verified | PASS |
| Journey H (failure recovery) | `tests/unit/failure-recovery.test.ts`, adapter tests | DB unreachable → 503 "nothing changed"; malformed bodies → 400/413; Gemini outage handled; source outage reported as a failure; overlapping jobs refused | PASS |
| Scheduler and notification tests | tests | Pass | PASS |
| Security review | See below | No P0 open | PASS |
| Accessibility and responsive | axe WCAG 2.1 A/AA (11 pages); 320, 390 and 768 px | 0 violations; no overflow | PASS |

**Security review details:**
- No secrets in git or the client bundle.
- Cron and admin routes return 401 without a token.
- Cross-origin writes are refused with 403.
- Private pastes are isolated.
- RLS is on with a least-privilege role.
- Outbound fetches are limited to an allowlist (no SSRF surface).
- Security headers verified in production.
- **Limitation:** identity is an anonymous cookie, not accounts.

## 11.5 Deployment and submission

| Item | Result | Status |
|---|---|---|
| Vercel | Production `READY`; `/`, `/onboarding`, `/radar`, `/inbox`, `/settings`, `/explore` return 200; database `reachable: true` from `bom1`; no error logs in the last hour (`vercel logs`) | PASS |
| Production URL | https://live-show-radar.vercel.app | PASS |
| GitHub | https://github.com/wisepilot071/live-show-radar (public, `main`) | PASS |
| Environment-variable docs | `.env.example`, README, `docs/DEPLOYMENT.md` | PASS |
| README | Updated for Parts 1–5 | PASS |
| Database setup instructions | README §Database | PASS |
| Components Map | `docs/ARCHITECTURE.md` (9 layers, 4 Mermaid diagrams) | PASS |
| This checklist | `FINAL_ACCEPTANCE_CHECKLIST.md` | PASS |
| No committed secrets | Pattern scan plus exact-value scan before each push | PASS |
| No test fixtures shown as live data | TEST records deleted after tests; production inbox has 0 notifications; illustrative events labelled and only on `/explore` | PASS |

## 11.6 Final quality gate

| # | Question | Answer, with evidence |
|---|---|---|
| 1 | Can a new user complete onboarding? | **Yes.** Local browser, plus production API journey A |
| 2 | Can users manage artists and saved shows? | **Artists: yes** (production). **Saved shows: yes** on the real DB in integration tests; there's no real event in production to save |
| 3 | Does persistent storage work? | **Yes.** Production profile persisted across requests, then deleted |
| 4 | Is a legitimate external event source integrated? | **Yes, MusicBrainz, with real requests.** But it has no current Indian shows. Ticketmaster and Bandsintown need keys |
| 5 | Does Gemini Flash do a real task? | **Yes.** Grounded extraction of pasted announcements; a real call succeeded |
| 6 | Are evidence and ticket uncertainty handled? | **Yes.** Unit and integration tests |
| 7 | Can discovery run through a supported mechanism? | **Yes.** Vercel Cron is registered and the production cron route ran successfully. The automatic run is still pending (first at 07:00 IST) |
| 8 | Are changes detected without duplicates? | **Yes.** Journeys 5 and 6 |
| 9 | Are notifications based on real preferences? | **Yes.** `decide` tests |
| 10 | Are deadline reminders based on trustworthy data? | **Yes.** Verified deadline required |
| 11 | Are unavailable providers handled safely? | **Yes.** Journey H tests |
| 12 | Has the consolidated suite run? | **Yes.** 86/86 |
| 13 | Does the production build succeed? | **Yes.** Locally and on Vercel |
| 14 | Was deployment verified, not just prepared? | **Yes.** Live routes, DB connectivity, cron run, auth checks |
| 15 | Does the Components Map match the code? | **Yes.** Real paths; statuses marked |
| 16 | Are blockers documented? | **Yes.** Below |

## Summary

| Status | Count | Items |
|---|---|---|
| PASS | all other rows | Everything above not listed below (some marked "with limitation" or "partial" where noted) |
| BLOCKED | 5 | Real Indian event data (source coverage); Journey C to a real Radar card; email delivery (Resend key + domain); Ticketmaster/Bandsintown credentials; production UI check in the in-app browser (tooling) |
| FAIL | 0 | — |
| NOT IMPLEMENTED (deliberate) | 3 | Spotify import; Telegram, push and WhatsApp channels; user accounts (anonymous cookie identity instead) |

**Pending observation (not counted above):** the first *automatic* Vercel Cron run, scheduled for 2026-10-11 01:30 UTC. Check `/api/admin/status` (`lastScheduledRun`) after that time.
