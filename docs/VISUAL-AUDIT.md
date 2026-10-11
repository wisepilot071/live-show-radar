# Visual audit matrix

Audit date: 2026-10-11. Scope: every real route in `src/app` (no routes were added).

**Rule for this pass:** style only. No heading, title, tab, eyebrow or button text was changed.
This is verified mechanically: `node scripts/extract-ui-text.mjs` lists every static heading, title, eyebrow and button label.
Its output before and after the change differs only by *added* controls (the new player controls listed below).
The one exception is the old per-card "Watch performance" overlay button. It was replaced by the brief's required "Start watching" action, and "Watch performance" remains as the queue items' accessible label.

## Shared system (applies to every row below)

| Area | Before | After |
|---|---|---|
| Page headers | Plain serif heading on the canvas | Same text on a dark "stage" panel with a decorative concert photo. Each photo gets a brand-green colour wash and an ink gradient behind the text (`PageHeader atmosphere=…`, `<Atmosphere>`) |
| Photos | One Unsplash photo on Discover | Central manifest `src/data/visual-assets.ts` with four photos (source, licence, size and focal point for each). Photos are self-hosted in 800w/1600w WebP via `srcset`. They are always `alt=""` and never used inside event UI (enforced by `tests/unit/visual-assets.test.ts`) |
| Cards | Flat border | Layered shadows: `--shadow-card` (contact + ambient) and `--shadow-card-hover`. Event cards lift by 2px on hover (off under reduced motion), get a lime (your city) or coral (confirmed deadline) accent edge, and have a shadowed date tile |
| Empty states | Small icon in a circle | Static radar rings (brand motif) with a faint lime glow. They imply no activity |
| Loading | Pulsing dot + text on every page | Content-shaped skeletons (`Skeletons.tsx`: event grid, row list, page, detail, player stage) with a shimmer that stops under reduced motion. The dot loader stays only for short inline checks (Telegram, Google Calendar, search) |
| Icons | lucide-react throughout | Unchanged library. Empty-state and stage icons use `strokeWidth 1.75` at `size-5`/`size-6` |
| Motion | rise / pop / sweep | Adds `eq` (equaliser, only while YouTube reports PLAYING) and `shimmer` (skeletons). Both are disabled by the global `prefers-reduced-motion` rule |
| Radar sweep | — | Unchanged (`RadarVisual`) |

## Per route

| Route | Existing heading text (unchanged) | Layout | Images | Cards / icons | Loading · error · empty | Mobile (375px) | Weaknesses found | Improvements made | Functionality preserved | Test criteria → result |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` landing | h1 "Your artists. Your next unforgettable night."; eyebrow "● For people who live for live music"; h2 "One place for every show that matters to you.", "Three steps. No setup homework.", "Labelled by what we actually know." (the "what we verify" section, eyebrow "Transparency"), "Stop finding out after the early-bird is gone." | Hero + radar visual, preview, how-it-works, trust, CTA | Hero: none (radar visual) | Trust table | — | Stacked | CTA band flat, page ended weakly | CTA now sits on an inset stage panel (gold-stage photo); trust table layered | Both CTAs → `/onboarding/artists`, `/explore` | axe 0 · overflow 0 ✔ |
| `/explore` | Eyebrow "Explore before you commit"; h1 "Here’s how your radar will read."; h2 "What every card tells you", "Ready to make it yours?"; alert "These are illustrative examples, not live listings" | Header, warning, example cards, anatomy, CTA | panorama-band (header only, never on the example cards) | EventCard ×N, anatomy panel layered | — | Stacked | Header lacked atmosphere | Stage header; layered anatomy panel | Illustrative warning kept above the cards | axe 0 · overflow 0 ✔ |
| `/onboarding/artists` | title "Choose Your Artists"; eyebrow "Your watchlist"; h2 "Connect your music taste", "Suggested artists", "Can’t find an artist? Search everyone", "Your artists"; button "Save My Artists" | Step header, Spotify card, picker, search, sticky footer | festival-sunset (step header) | Spotify card layered | Skeleton while saved choices load; existing picker skeleton/error/retry | Sticky footer fits | Flat header, dot loader | Stage header shared by all 3 steps; skeleton | Save/advance, Add all, follow/unfollow | axe 0 · overflow 0 ✔ |
| `/onboarding/location` | title "Your city first. The rest of India too."; eyebrow "Where you'll go"; h2 "How we’ll rank shows" | Step | festival-sunset | — | as above | ✔ | — | Stage header | City save | axe 0 · overflow 0 ✔ |
| `/onboarding/alerts` | title "Tell us what's worth a nudge."; eyebrow "What matters"; h2 "Let me know about", "Where to reach you" | Step | festival-sunset | Telegram/Google panels layered | Inline dot loaders (short checks) | ✔ | — | Stage header, layered connect panels | Finish → `/radar` | axe 0 · overflow 0 ✔ |
| `/radar` Discover | h1 "Your artists. Your next unforgettable night."; h2 "Live on Stage", "Seen an announcement?"; state titles ("Ready for the first check", "No upcoming shows found for your artists", …) | Hero + status, states, sections, Live on Stage, intake | concert-crowd (Unsplash, credited) | Event cards layered; state rings | Event-grid skeleton; error/retry states unchanged | ✔ | Videos were 3 separate players with no sequence; dot loader | **Live on Stage rebuilt**: one featured player + queue, "Start watching", auto-advance on ENDED, real playback state, equaliser only while playing, skip on error, autoplay-blocked prompt, cleanup on navigation, stage skeleton, retry | Check now, Add artists, filters, save, intake | axe 0 · overflow 0 ✔; playback flow tested live (below) |
| `/radar/events/[id]` | h2 "When and where", "Tickets", "Artists", "Where this comes from" | Detail sections | **None on purpose**: a generic photo here would read as the event's poster | Sections layered | Detail skeleton | ✔ | Dot loader | Skeleton, layered panels | Save, booking, source links | axe 0 · overflow 0 ✔ |
| `/artists` | eyebrow "Artists"; title "Your artists" / "N artists on your radar"; h2 "Choose Your Artists", "Add artists", "Your list" | Header, catalogue, search, list | gold-stage | Rows | Page skeleton | ✔ | Flat header | Stage header; skeleton | Save My Artists, Add all, remove, undo | axe 0 · overflow 0 ✔ |
| `/inbox` | eyebrow "Inbox"; title "Your alerts" / "N unread alerts" | Header, list | panorama-band | Alert rows (unread raised) | Row skeleton; error, storage-off, empty | ✔ | Dot loader | Stage header, row skeleton, ringed empty state | Mark read / all read | axe 0 · overflow 0 ✔ |
| `/saved` | eyebrow "Saved shows"; title "Saved shows" / "N shows you're keeping an eye on" | Header, filters, cards | festival-sunset | EventCards | Page skeleton; empty + filter-empty | ✔ | Dot loader | Stage header, skeleton | Unsave, filters | axe 0 · overflow 0 ✔ |
| `/bookings` | eyebrow "My bookings"; title "Shows you've booked." | Header, list | festival-sunset | Booking cards layered | Row skeleton; error, storage-off, empty | ✔ | Dot loader | Stage header, skeleton | Remove booking, calendar status | axe 0 · overflow 0 ✔ |
| `/settings` | eyebrow "Settings"; title "Tune your radar."; sections "Location", "Artists", "Alerts", "Connections", "Your data", "How alerts are checked"; h3 "Delivery channels" | Header, section nav, sections | panorama-band | Connection status panel layered | Form skeleton | ✔ | Dot loader | Stage header, skeleton | All preference saves, reset | axe 0 · overflow 0 ✔ |
| 404 (`not-found`) | "Nothing on the radar here" | Centered empty state | — | Ringed empty state | — | ✔ | Small icon | Radar rings | Go home / Continue setup | axe 0 · overflow 0 ✔ |

## Live on Stage: playback test log (local dev, real YouTube)

| Check | How | Result |
|---|---|---|
| Nothing loads before a click | Page load | No iframe, no YouTube script ✔ |
| "Start watching" plays item 1 | Click | YouTube reported PLAYING → "Now playing · 1 of 9" ✔ |
| Auto-advance on ENDED | Seek to the last 3s via the player's own command channel | Item 2 started in the same player; still 1 iframe ✔ |
| Paused is not shown as playing | pauseVideo | "Paused", equaliser not animating ✔ |
| Pick from queue | Click item 5 | "Now playing · 5 of 9"; 1 iframe ✔ |
| Error handling | Load an invalid ID into the live player | YouTube onError → message + "Play next" + "Watch on YouTube"; "Play next" recovered to item 2 ✔ |
| Cleanup | In-app navigation to /artists | 0 iframes ✔ |
| Autoplay blocked | Not reproducible on demand in this browser | Code path present: if PLAYING doesn't arrive within 6s of a play request, a "Press play to continue" prompt appears. **Not live-tested.** |
