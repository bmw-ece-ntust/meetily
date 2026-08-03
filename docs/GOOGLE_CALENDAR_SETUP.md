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
