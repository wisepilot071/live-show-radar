# Part 1: Items for the consolidated checkpoint (after Parts 1–3)

## Already checked in Part 1

These checks were run manually in the in-app browser preview during development. No automated tests were written.

- `tsc --noEmit` passes with strict mode and `noUncheckedIndexedAccess`.
- `next build` succeeds. All 14 routes compile.
- End-to-end at 1280px, in this order: choose the Mix method, skip Spotify, then search.
  - "pcrc" matches by alias, and the result can be reached with arrow keys and Enter.
  - Pressing Enter three times toggles the artist on, off and on again. It never creates a duplicate.
  - "NIRVANA" shows the warning for two artists with the same name, each with distinguishing details.
  - A name that isn't in the catalogue shows the empty state, and "Add as typed" adds it.
  - After a refresh, the query and all 3 selections are still there.
  - Review, then cities (adding Mumbai), then alerts (one toggle off). localStorage holds the expected state.
  - Setup status shows: 1 Done, 2–4 Not available.
  - `/radar` shows "Monitoring: Not active".
- An unknown path under `/onboarding/*` shows the onboarding 404 page.
- At 375px, no route scrolls horizontally (scrollWidth equals clientWidth), and buttons are at least 36px tall.

## Still to validate

1. **Screen-reader pass** (NVDA or VoiceOver):
   - announcements when an artist is added or removed
   - the switch role on alert toggles
   - the progress-bar labels
   - focus order inside the sticky footer
2. **Reduced motion**: confirm the radar sweep and the ping animation stop when the OS setting is on.
3. **Colour contrast audit** of `text-fg-muted` on `bg-surface-2`, and of the badge colours on their tinted backgrounds.
4. **Storage blocked** (Safari private mode or similar): the header should say "Not saved" and setup status should mark preferences as Failed.
5. **Corrupt draft**: put an invalid value in `lsr.onboarding.v1`. The app should recover quietly with a fresh draft.
6. **Browser back and forward** across the method → spotify → artists switch, including after "Continue manually".
7. **Spotify endpoints**: re-check `GET /me/following` and `GET /me/top/artists` against Spotify's current docs before Part 4.
8. **Server persistence swap**: when Part 2 lands, confirm `OnboardingProvider` works with the server `OnboardingDraftStore` without any UI changes.
9. **Header label on `/radar`**: the button still reads "Build my radar" after onboarding is finished. Consider changing it to "Edit radar" once account state exists.

## Known limitations

- The artist catalogue is a **36-artist sample**. Real artist search arrives in a later part.
- The draft is stored in **this browser only**. There are no accounts and no sync between devices.
- City list is bundled (14 Indian cities).
- `window.confirm` is used for "Start over". It is accessible, but it isn't styled. A styled confirmation dialog could replace it later.
