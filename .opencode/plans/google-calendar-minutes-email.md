# Plan: Google Calendar → Email Minutes to Attendees

Feature: after minutes generated, send minutes to meeting attendees pulled from Google Calendar.

## Design decisions (from user)

- Calendar: Google Calendar API
- Send flow: review dialog first (never auto-send)
- Minutes format: `.md` file attachment (short body intro)
- Event matching: auto by recording time window, fallback to "no event found" state
- OAuth: user creates Google Cloud OAuth client (Desktop type) — guide at `docs/GOOGLE_CALENDAR_SETUP.md`

## Tasks

- [ ] Migration `20260803000000_add_google_config.sql` — `google_config` table (client_id, client_secret)
- [ ] Backend `frontend/src-tauri/src/google/`:
  - [ ] `config.rs` — load/save client credentials from SQLite
  - [ ] `auth.rs` — OAuth2 loopback flow + PKCE, refresh token in macOS Keychain (`keyring`), access token cache + refresh
  - [ ] `calendar.rs` — `events.list` on primary calendar around meeting time, extract attendee emails (dedupe, drop self via Gmail profile)
  - [ ] `gmail.rs` — RFC 2822 MIME with `.md` attachment, `users.messages.send`
  - [ ] `commands.rs` — `get/set_google_config`, `google_connect`, `google_disconnect`, `google_status`, `google_find_event`, `google_send_minutes`
- [ ] Cargo deps: `keyring`, `sha2`
- [ ] `lib.rs` — `pub mod google;` + register commands
- [ ] Frontend `GoogleSettings.tsx` — credentials + connect/disconnect + status, added to `app/settings/page.tsx`
- [ ] Frontend `SendMinutesDialog.tsx` — event info, attendee checkboxes, subject input, send
- [ ] Wire dialog into `SummaryPanel` via `SummaryUpdaterButtonGroup` "Send" button; markdown from `summaryRef.getMarkdown()`

## Trigger

Manual: "Send to attendees" button appears next to Copy/Save when summary exists. Not auto-popup on `job-completed`.
