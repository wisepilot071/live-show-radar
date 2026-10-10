# Parts 4–5 checkpoint (consolidated testing, monitoring, notifications, release)

## Phase A: audit of Parts 1–3 (fixed)

| Severity | Issue | Fix |
|---|---|---|
| P0 | Events pasted by one user could merge into shared events and be seen by other users | Migration `0003` adds `event_sources.submitted_by`. Pasted records never merge or create candidates, there's a visibility guard on every read, and source ids are per user |
| P1 | Upsert crashed when a text value contained "T" (e.g. "TEST Hall"), because it was parsed as a date | `comparable(field, value)` now compares by field type; regression test added |
| P1 | Gemini timestamps without an offset were accepted | Strict instant validation; IST is applied only for a confirmed Indian city (`withKnownOffset`) |
| P1 | Two regexes had lost their backslashes during an edit | Fixed and covered by tests |
| P2 | Artist search returned irrelevant matches | MusicBrainz score threshold raised to 70; search rate limited to 60/min/IP |
| P2 | Lint errors (`set-state-in-effect`) and an axe `dl` violation | Hooks refactored to derived state; `EventDetail` markup fixed |

## Part 4: built and verified

- **Scheduler.** `GET /api/cron/monitor` returned 401 without auth. With `CRON_SECRET` it ran for real: MusicBrainz checked 1 due artist and found 0 new events, and a `job_runs` row was written.
- **Change detection.** Field-level `event_changes` are classified into meaningful kinds; URL-only edits and conflicts are ignored.
- **Decision engine.** Pure and deterministic, with unit tests for every skip reason and the priority rules.
- **Duplicate prevention.** Unique `(user_id, dedupe_key)`, one early-bird alert per event, and a change cursor. Leases are tested against overlapping runs and expired-lease takeover.
- **In-app inbox.** `/inbox` with read/unread, mark all read, mute and a real badge. Checked in the browser with a labelled `is_test` notification, which was deleted afterwards.
- **Email.** Built against Resend with idempotency keys, retries, backoff and an allow-list. **Not configured**: the Resend key available to copy was empty, so no email was sent.
- **Reminders.** 72h/24h before verified deadlines only, smallest window first. Integration tests cover both the reminder and the no-deadline case.

## Part 5: quality checks

| Check | Result |
|---|---|
| Lint | Clean |
| Type check | Clean |
| Tests | 78/78 (unit + DB integration); TEST records cleaned up and verified by query |
| Build | Passes |
| Accessibility | axe: 0 violations on 11 pages |
| Responsive | No overflow at 320, 390 or 768 px |
| Security headers | Verified with curl |
| Client bundle | Secret scan clean |

## Open items

- Vercel deployment is blocked by authorisation. See [DEPLOYMENT.md](DEPLOYMENT.md).
- Email needs a Resend key and a verified sender.
- There are very few real upcoming Indian events from MusicBrainz, and the extra sources need keys.
