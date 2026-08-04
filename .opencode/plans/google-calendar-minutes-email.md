# Plan: Google Calendar → Email Minutes to Attendees (desktop UI)

Feature: send minutes to meeting attendees pulled from Google Calendar.
**OAuth lives entirely on ai-meeting-agent** — desktop is UI + thin proxy.

## Design decisions (from user)

- Calendar: Google Calendar API, server-side per-user accounts
- Manual send: review dialog first (never auto-send)
- Minutes format: `.md` file attachment (server builds email from stored summary)
- Event matching: auto by recording time window (server searches all connected accounts)
- Desktop holds zero Google credentials (rework commit `0cd1ca6`)

## Tasks

- [x] ~~Desktop OAuth~~ → removed; server web-flow OAuth used instead
- [x] Migration `20260803120000_drop_google_config.sql` — drop `google_config`
- [x] `google/commands.rs` thin proxies via api_client: `get_google_status`, `google_connect_url`, `google_set_auto_join`, `google_disconnect_account`, `google_find_event`, `google_send_minutes`
- [x] api_client Google endpoint bindings
- [x] `utils::open_external_url` (open server OAuth URL in browser)
- [x] `GoogleSettings.tsx` — server status view, per-account auto-join toggle, connect/disconnect via server
- [x] `SendMinutesDialog.tsx` — event info, attendee checkboxes, extra recipients, subject, already-sent state
- [x] `SummaryPanel` — Send + Certify & Send buttons
- [x] `docs/GOOGLE_CALENDAR_SETUP.md` — server-only OAuth guide

## Server endpoints consumed

- `GET /google/status` · `GET /google/connect`
- `PATCH|DELETE /google/accounts/:email`
- `GET /google/meetings/:id/event` · `POST /google/meetings/:id/send-minutes`
- `PATCH /meetings/:id/certify`
