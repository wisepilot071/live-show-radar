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
| Telegram `@liveshow101bot` | ✅ Bot and webhook verified in production. **You:** link your chat once (Settings → Alerts → Connect Telegram → Start) |
| Email (Resend) | ✅ Key verified with a real send (test email accepted). Test mode: sender `onboarding@resend.dev`, delivers **only to the Resend account's own address** (`sagar_choudhary@pg27.mesaschool.co`) |
| Google Calendar | 🟡 OAuth client configured in production. **You:** Settings → Connections → Connect Google Calendar (sign in as a test user) |
| Ticketmaster | ✅ Live-tested: artist searches work, but **0 music events in India** (Ticketmaster doesn't sell in India) |
| ScrapingBee ("Beescraper") | ✅ Live as **news-announcement discovery**: real Google News searches; Gemini reads only pre-filtered snippets; kept only with a full upcoming date in an Indian city; never claims tickets. 10 credits per artist search, max 8 artists per run (`SCRAPINGBEE_MAX_ARTISTS_PER_RUN`) |
| Spotify | Frontend-only "Coming soon" card by design |
| Gemini Flash | ✅ Live. Free-tier rate limits (HTTP 429) can pause news reading; it resumes on the next run |

## Keys provided on 2026-10-11

Resend, Google OAuth, Ticketmaster and ScrapingBee keys are stored in `.env.local` (git-ignored) and in Vercel. They were pasted in chat, so **rotate them** once everything is confirmed working:
- Resend → API Keys
- Google Cloud → Credentials → reset secret
- Ticketmaster → My Apps
- ScrapingBee → dashboard
- Telegram → @BotFather `/revoke`

The Ticketmaster consumer secret isn't used: the Discovery API only needs the key.

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
