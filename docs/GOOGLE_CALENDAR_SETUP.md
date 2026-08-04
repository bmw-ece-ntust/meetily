# Google Calendar + Gmail Setup Guide

Server-side integration (ai-meeting-agent owns all OAuth). One-time setup, ~10 minutes.

What it does once configured:

- Polls each connected account's calendar every minute for today's Teams meetings
- Auto-joins them with the meeting bot (recording → transcript → minutes)
- Emails the minutes (.md attachment) to event attendees — only after a human
  certifies them, or when someone manually sends from the desktop app

The desktop app (Meetily) stores **no** Google credentials.

## 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com/
2. Top bar → project dropdown → **New Project**
3. Name: `meeting-agent` (anything works) → **Create**
4. Make sure the new project is selected in the top bar

## 2. Enable APIs

1. Left menu → **APIs & Services** → **Library**
2. Search **Google Calendar API** → click → **Enable**
3. Search **Gmail API** → click → **Enable**

## 3. Configure the OAuth consent screen

1. Left menu → **APIs & Services** → **OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in:
   - App name: `Meeting Agent`
   - User support email: your email
   - Developer contact email: your email
4. **Save and Continue** to **Scopes** → **Add or Remove Scopes**, add:
   - `https://www.googleapis.com/auth/calendar.readonly` (read calendar events)
   - `https://www.googleapis.com/auth/gmail.send` (send email on your behalf)
5. Continue to **Test users** → **Add Users** → add every Google account that
   will connect (each user who wants auto-join). While in "testing" mode only
   listed users can sign in.
6. **Save and Continue** → **Back to Dashboard**

## 4. Create the OAuth client ID (Web application)

1. Left menu → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Meeting Agent Server`
5. **Authorized redirect URIs** → add:
   `http://<server-host>:8080/google/callback`
   (use the real host/IP the server runs on; must match `GOOGLE_PUBLIC_BASE_URL`)
6. **Create** → copy the **Client ID** and **Client Secret**

## 5. Configure the server

In the ai-meeting-agent `.env` (see `.env.example`):

```bash
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=<from step 4>
GOOGLE_CLIENT_SECRET=<from step 4>
GOOGLE_TOKEN_KEY=<openssl rand -hex 32>
# Only if the server's public URL differs from http://<host>:<port>:
# GOOGLE_PUBLIC_BASE_URL=http://127.0.0.1:8080
# Poll interval (seconds, min 30):
# GOOGLE_CALENDAR_POLL_INTERVAL_SECS=60

# Required for auto-join dispatch:
MEETING_BOT_ENABLED=true
MEETING_BOT_URL=<meeting-bot service URL>
```

Restart the server. Losing `GOOGLE_TOKEN_KEY` means every account must reconnect.

## 6. Connect accounts

Per user, either:

- **Desktop**: Meetily → Settings → Google Calendar & Gmail → **Connect Google
  Account** (opens the browser; the flow completes on the server), or
- **API**: `GET /google/connect` (with API key) → open the returned `auth_url`
  in a browser → consent → Google redirects to `/google/callback`.

Google shows "Google hasn't verified this app" for testing-mode apps —
expected. Click **Advanced** → **Go to Meeting Agent (unsafe)**, grant both
permissions.

Manage accounts:

- `GET /google/status` — list connected accounts
- `PATCH /google/accounts/:email` `{"auto_join": false}` — pause auto-join
- `DELETE /google/accounts/:email` — remove the grant

## 7. Daily operation

- The scheduler dispatches a Teams bot 2 minutes before each event start
  (window: start−2min to +15min; each event joins once).
- **Teams lobby**: the bot may wait for admission — someone in the meeting
  admits it manually.
- When minutes are ready, certify them (desktop **Certify & Send** button, or
  `PATCH /meetings/:id/certify` `{"certified": true}`) — the server emails the
  .md minutes to the event attendees exactly once.
- Manual send without certification: desktop **Send** button on the summary
  panel (review recipients first).

## Notes

- Only **Microsoft Teams** join links are dispatched. Zoom/Meet links are
  parsed but ignored.
- Tokens are AES-256-GCM encrypted at rest in the server database.
- Test-mode OAuth may expire refresh tokens (~7 days for unverified apps);
  reconnect the account if sends start failing.
