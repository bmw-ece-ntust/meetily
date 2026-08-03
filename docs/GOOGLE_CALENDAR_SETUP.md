# Google Calendar + Gmail Setup Guide

Required before the "Send minutes to attendees" feature can sign in. One-time setup, ~10 minutes.

## 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com/
2. Top bar → project dropdown → **New Project**
3. Name: `meetily-minutes` (anything works) → **Create**
4. Make sure the new project is selected in the top bar

## 2. Enable APIs

1. Left menu → **APIs & Services** → **Library**
2. Search **Google Calendar API** → click → **Enable**
3. Search **Gmail API** → click → **Enable**

## 3. Configure the OAuth consent screen

1. Left menu → **APIs & Services** → **OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in:
   - App name: `Meetily`
   - User support email: your email
   - Developer contact email: your email
4. **Save and Continue** through to **Scopes** → **Add or Remove Scopes**, add:
   - `https://www.googleapis.com/auth/calendar.readonly` (read calendar events)
   - `https://www.googleapis.com/auth/gmail.send` (send email on your behalf)
5. Continue to **Test users** → **Add Users** → add your own Google email
   - While the app is in "testing" mode, only listed test users can sign in. This is fine for personal/internal use.
6. **Save and Continue** → **Back to Dashboard**

## 4. Create the OAuth client ID

1. Left menu → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Meetily Desktop` → **Create**
5. Copy the **Client ID** and **Client Secret** from the dialog (you can also download the JSON)

> **Server (ai-meeting-agent) auto-join:** create a *second* OAuth client of type
> **Web application** (same project, same consent screen). Add authorized
> redirect URI `http://<server-host>:8080/google/callback`. Put its client
> ID/secret in the server's `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env
> vars (see `.env.example`). The Desktop-app client created above is only for
> the Meetily desktop app.

## 5. Enter credentials in Meetily

1. Open Meetily → **Settings**
2. Scroll to **Google Calendar & Gmail**
3. Paste **Client ID** and **Client Secret** → **Save**
4. Click **Connect Google Account**
5. Browser opens → sign in with the Google account you added as a test user
6. Google shows a warning "Google hasn't verified this app" — expected for testing-mode apps. Click **Advanced** → **Go to Meetily (unsafe)**
7. Grant both permissions
8. Browser shows "Authorization received" — return to Meetily, status shows your email

## Notes

- The refresh token is stored in the macOS Keychain, not in the app database.
- Disconnecting (Settings → Disconnect) removes the token from the Keychain.
- If Google expires the test-mode refresh token (7 days for unverified apps in some cases), just click **Connect** again.
- Sending is never automatic — you review the recipient list and subject before every send.

## Server-side (ai-meeting-agent): Teams auto-join + certified email

Separate from the desktop flow above. The server polls each connected
account's calendar for today's Teams meetings, auto-joins them with the
meeting bot, and emails the minutes to attendees **only after a human
certifies them**.

1. Create the **Web application** OAuth client (step 4 note above).
2. Server env (`.env`, see `.env.example`):
   - `GOOGLE_CALENDAR_ENABLED=true`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (web client)
   - `GOOGLE_TOKEN_KEY` — generate with `openssl rand -hex 32`
   - `MEETING_BOT_ENABLED=true` + `MEETING_BOT_URL` (required for auto-join)
3. Connect an account: call `GET /google/connect` (with API key) → open the
   returned `auth_url` in a browser → consent → Google redirects to
   `/google/callback` → account stored. Repeat per user.
4. `GET /google/status` lists connected accounts;
   `PATCH /google/accounts/:email` toggles `auto_join`;
   `DELETE /google/accounts/:email` removes the grant.
5. Certify minutes: `PATCH /meetings/:id/certify` with
   `{"certified": true}` — the server emails the `.md` minutes to the event
   attendees (once; re-certifying does not re-send).

Notes:

- Only **Microsoft Teams** join links are dispatched. Zoom/Meet links are
  parsed but ignored.
- The bot may land in the Teams lobby — someone must admit it manually.
- Refresh tokens are stored AES-256-GCM encrypted in the server database;
  losing `GOOGLE_TOKEN_KEY` means all accounts must reconnect.
