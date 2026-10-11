# Live Show Radar — Components Map

![Live Show Radar — Components Map](./live-show-radar-components-map.png)

- **Image:** `live-show-radar-components-map.png` (3200×1800). Vector source: `live-show-radar-components-map.svg`.
- **Regenerate:** run `node scripts/render-components-map.mjs`. The SVG is built in code and rasterised with `sharp`, which is already installed through `next`. The script adds no dependency, and the app never imports it.
- **Source:** mapped from the repository at commit `d92b2f6`.

## How to read it

- **Columns:** Actor → Trigger → Input → Context → Processing → AI → Output.
- **Swimlanes:** each lane is one real flow in the app.
- **Arrows:** a solid arrow is a request or a synchronous step. A dashed arrow, or a box with a dashed border, is scheduled or picked up on a later run.
- **Colours:**

| Colour   | Meaning                                       |
| -------- | --------------------------------------------- |
| Blue     | User / actor                                  |
| Green    | External service                              |
| Yellow   | App processing (Next.js on Vercel)            |
| Lavender | AI (Gemini Flash)                             |
| Peach    | Output to the fan                             |
| Grey     | Storage (Supabase Postgres, schema `radar`)   |

## Primary flow

1. **Trigger.** Vercel Cron calls `/api/cron/monitor` at 01:30, 09:30 and 17:30 UTC (`vercel.json`). A fan can also press **Check now** (`/api/me/discovery`, 4 per hour).
2. **Targets.** `runDiscovery` builds its target list from followed artists plus the curated catalogue, adds the cities due for a news sweep, and checks the credit balance before any news call.
3. **Sources queried:**
   - Ticketmaster Discovery v2.
   - MusicBrainz events.
   - News search and article fetch, through ScrapingBee. Articles are always fetched by the provider, never directly by the app.
4. **AI extraction.** Article text goes to Gemini Flash, which extracts dates and cities. Results are cached in `ai_extractions`.
5. **Deterministic grounding.** The verbatim quote, city, day and month must all appear in the article. The date must be upcoming and the city a known Indian city.
6. **Normalise and store.** Normalise the record and keep only safe ticket URLs, then dedup and upsert into `events`, `event_sources` (provenance) and `event_changes`.
7. **Notifications.** In the same job, `runNotificationPipeline` → `decide()` keeps only shows in the fan's chosen cities (saved shows always pass) and only verified info. It sends one digest per artist to the in-app Inbox, to email (Resend or SMTP, double-opt-in addresses only) and to Telegram.
8. **Browse.** The fan sees the shows with city focus: home city, then Bengaluru, then other cities within 60 days.
9. **Ticket link.** A verified ticket link opens the seller's site. Nothing is sold in the app.
10. **Booking.** "I've booked" records a `user_confirmed` booking. If Google is connected, it also creates a Google Calendar event and an Inbox alert.

## Components and where they live

| Box | Code |
| --- | --- |
| Fan identity | `src/server/session.ts`: signed `lsr_profile` cookie. `src/server/profile-link.ts`: Google linking |
| Search & follow | `src/app/api/me/artists/route.ts`: `after()` follow-time lookup |
| MusicBrainz | `src/integrations/musicbrainz/*`, `src/integrations/events/registry.ts` |
| Vercel Cron | `vercel.json`, `src/app/api/cron/monitor/route.ts`, `src/server/monitoring.ts` |
| Check now | `src/app/api/me/discovery/route.ts` |
| Ticketmaster | `src/integrations/events/ticketmaster.ts` |
| News search + article fetch | `src/integrations/events/scrapingbee-news.ts` |
| runDiscovery pipeline | `src/server/ingest/pipeline.ts`, `normalize.ts`, `upsert.ts` |
| Gemini Flash | `src/integrations/gemini/client.ts`, `tour-extraction.ts`, `src/server/tour-extraction.ts`, `src/server/announcements.ts` |
| decide() / delivery | `src/server/notifications/decide.ts`, `process.ts`, `channels.ts`, `telegram.ts`, `message.ts` |
| City focus | `src/features/discovery/city-focus.ts` |
| Ticket link safety | `src/lib/ticket-url.ts` |
| Bookings + Calendar | `src/app/api/me/bookings/route.ts`, `src/server/bookings.ts`, `src/integrations/google/calendar.ts` |
| Pasted announcement | `src/app/api/me/announcements/route.ts`, `src/server/announcements.ts` |
| Storage | `db/migrations/0001`–`0010`, schema `radar` |

## Deliberately excluded or marked

- **Bandsintown:** the adapter exists in the registry, but no API key is configured, so it is not shown as an active source.
- **Spotify:** the UI shows it as "Coming soon". No integration exists.
- **Gmail:** not used. Email goes through Resend or optional SMTP.
- **Background worker:** there is none. Work runs only on cron calls and requests.
- **Ticketmaster:** live, but it has returned 0 Indian events so far, and the diagram says so.
- **Admin route:** the admin discovery route (`/api/admin/discovery`) is omitted for clarity. It runs the same pipeline as the cron.
- **Non-pipeline features:** curated "Live on Stage" videos and Wikimedia artist photos are left out because they are static, curated data and not part of the discovery pipeline.

## Limitations

- **Coverage:** this is a component map, not a sequence diagram. Retries, rate limits and failure paths are only summarised.
- **Source names:** the public UI calls the news source "News reports". The diagram names ScrapingBee because it is an internal architecture document.
