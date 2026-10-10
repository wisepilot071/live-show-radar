# Part 2: Checks run and items for the consolidated checkpoint (after Part 3)

## Lightweight checks actually run in Part 2

I ran these manually in the in-app browser against the dev server, plus `tsc` and `next build`. No automated tests were written.

- `tsc --noEmit` passes. `next build --webpack` succeeds with all 19 routes.
- **Migration:** the real Part 1 draft in localStorage loaded as version 2. All 3 artists were kept, the date/venue alert I had turned off stayed off, and the new triggers defaulted to on.
- **`/radar`:** shows the *not connected* situation, driven by a real `POST /api/events/discover` that returned `not_connected`. The status panel reads "Saved · Not connected · Not set up".
- **Illustrative preview:** each card's tag comes from its data (Early-bird open, Needs verification, Date or venue changed). "Mumbai — a city you prioritised" reflects the saved preference.
- **Save:** two rapid clicks produced **1** saved show. The toast appeared and the button now reads "Saved".
- **`/saved` filters:**
  - All 3, Bengaluru 2, Other cities 1, Upcoming 3, Needs verification 1. Every filter returned the right cards.
  - Sorting by show date and by recently saved both ordered correctly.
  - Unsave removed the show, and Undo restored it with its original save time.
- **`/radar/events/example-1`:** shows the illustrative banner, the right tags and the source panel. An unknown id shows "We can't find this show".
- **`/artists`:**
  - Added "Nirvana band" as typed, opened it, and chose **Find the right artist**.
  - The dialog opened with focus inside it. Searching "nirvana" showed the two-artist warning, and picking the US band replaced the typed entry (`sample:nirvana-us`) with no duplicate.
- **`/settings`:** 5 alert switches showing the stored values, and toggling one is saved. Connections show Spotify "Not available yet", event sources "Not connected", artist catalogue "Sample catalogue".
- **Discover API:** a valid body returns `not_connected`. A bad shape returns 400, and a body that isn't JSON returns 400.
- **Overflow sweep:** no horizontal overflow at 320px (all 10 sampled routes) or 390px (all 6 sampled). This includes every Part 2 page and the main Part 1 pages.

## Still to validate at the consolidated checkpoint

1. Screen-reader pass:
   - bottom tab bar
   - `aria-pressed` on Save and filter chips
   - toast announcements
   - focus return when the dialog closes
   - focus on the `?focus=` artist highlight
2. Keyboard path through `/artists`: expand a row, then the resolve dialog. Check that Esc closes the dialog and focus returns.
3. Reduced motion for the toast/dialog `rise` animation and the `pop` on Save.
4. Contrast of the `opacity-75` treatment on cancelled and past cards.
5. Dashboard situations not reachable without a source: `no_matches`, `sources_failed`, `partial`, `results` and stale. These need a test adapter registered in `REGISTERED_EVENT_SOURCES` (Part 3).
6. Behaviour with 60+ artists: list performance, filter, and sidebar counts.
7. Discover request size with many artists. The cap is 500, but it hasn't been load-tested.
8. Tablet width (768–1023px): the bottom-tab layout is used up to 1023px. Confirm that's the right breakpoint.

## Known limitations

- Saved shows are **snapshots**. With no discovery store, they can't show live changes.
- The event detail page can only show saved or illustrative events. Live events need a discovery store (Part 3+).
- The resolve dialog starts with the full typed name, so sometimes the user has to shorten the query (e.g. "Nirvana band" → "nirvana").
- "Shows outside your home city" (an alert trigger) and "Include relevant shows anywhere in India" (a discovery-scope setting) are separate settings on purpose. Their wording should be reviewed together with real users.
- The dev-server log still contains old error lines from a brief moment during the icon rename (`RadarSummary`/`RadarGlyph`). Those files no longer exist, and the build and pages are clean.
