# Integrations setup (what to configure after the build)

The app runs without any of these integrations. Each one shows **Not configured** until its credentials are present, and **Connected** only after a real provider response. Values go in Vercel → Project → Settings → Environment Variables (and in `.env.local` for local dev). Never commit them. You can push values from `.env.local` without printing them:

```bash
node scripts/vercel-env-push.mjs production
```

To push only some keys, add a comma-separated list: `node scripts/vercel-env-push.mjs production KEY1,KEY2`.

## Status (2026-10-11)

| Integration | Status |
|---|---|
| In-app inbox | ✅ Live |
| Telegram bot `@liveshow101bot` | ✅ Token verified with `getMe`; webhook registered in production. Linking a real chat needs **you** to press Start once |
| Email (Resend) | 🟡 Implemented and tested with mocks; **awaiting** `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_ALLOWED_RECIPIENTS` |
| Google Calendar | 🟡 Implemented and tested with mocks; **awaiting** an OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) |
| Beescraper | ⛔ Not integrated. No Beescraper code, docs or credentials were found anywhere, and there's no public product by that name (ScrapingBee's documented API has no structured events). **Needs:** the API docs (endpoints, auth, response fields) and a key. A new source plugs into `src/integrations/events/registry.ts` as one adapter file |
| Spotify | Frontend-only "Coming soon" card by design. No OAuth, API calls or credentials |
| Gemini Flash | ✅ Live (unchanged) |

## Telegram

1. Bot: `@liveshow101bot`. The token is in `.env.local` and Vercel as `TELEGRAM_BOT_TOKEN`. Because it was pasted in chat, consider `/revoke` in @BotFather and updating the variable.
2. `TELEGRAM_BOT_USERNAME=liveshow101bot`, plus a random `TELEGRAM_WEBHOOK_SECRET`.
3. Register the webhook (already done for production):
   ```bash
   node scripts/telegram-set-webhook.mjs https://live-show-radar.vercel.app
   ```
4. **User flow:** Settings → Alerts → Telegram → **Connect Telegram** opens `t.me/liveshow101bot?start=<single-use token>`; press **Start**. The token is single-use, expires after 15 minutes and is stored only as a SHA-256 hash. `/stop` in the chat or **Disconnect** unlinks.

## Email (Resend)

1. Verify a sending domain at https://resend.com/domains.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (for example `Live Show Radar <alerts@your-domain>`).
3. Set `EMAIL_ALLOWED_RECIPIENTS` (comma-separated). There's no double opt-in yet, so only allow-listed addresses are ever mailed.
4. Users turn email on in Settings → Alerts and enter their address.

## Google Calendar

1. Google Cloud Console → enable **Google Calendar API**.
2. Set up the OAuth consent screen with scope `https://www.googleapis.com/auth/calendar.events` (the only one requested). While in "Testing", add your Google account as a test user.
3. Create credentials → OAuth client ID → **Web application**.
   - **Authorised redirect URI:** `https://live-show-radar.vercel.app/api/integrations/google/callback`
   - **For local dev also:** `http://localhost:3003/api/integrations/google/callback`, with `APP_BASE_URL=http://localhost:3003` in `.env.local`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Optionally set `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64url); otherwise it's derived from `SESSION_SECRET`.
5. **User flow:** Settings → Connections → **Connect Google Calendar**. Bookings recorded earlier are added right after connecting.

**How calendar events are written:**
- The event data has no end time, so each booking becomes an **all-day event** on the show's local date.
- The real start time, when known, goes in the title and description. No duration is invented.
- Event ids are deterministic per booking, so retries never duplicate.

## Bookings (no credentials needed)

- **"I've booked my ticket"** records a `user_confirmed` booking. It's never described as verified: no ticketing API can confirm purchases. Opening a ticket link never creates a booking.
- **Order of operations:** save the booking (idempotent per user and event), then add it to Google Calendar (if connected), then send in-app, email and Telegram notifications with the *actual* calendar result.
- A failed calendar sync or notification never removes the booking. Calendar sync can be retried from My Bookings.

## Identity

There are no user accounts in this app; that's the existing system and it's kept as is. Each browser gets an anonymous, signed, httpOnly profile cookie. Bookings, Telegram links and calendar connections belong to that profile, and every server query is scoped to it. A different browser or device is a different profile.
