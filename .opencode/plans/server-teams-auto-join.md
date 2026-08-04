# Plan: Server-side Teams auto-join + certified minutes email

Repo: `ai-meeting-agent`, branch `feat/calendar-auto-join-certified-email`.
Companion desktop work: meetily branch `feat/google-calendar-minutes-email`.

Flow: server polls each connected Google account's calendar for today's
Teams meetings → dispatches meeting-bot at start−2min → minutes generated
by existing pipeline → human certifies → server emails .md minutes to
event attendees.

Decisions: per-user Google accounts · refresh tokens AES-256-GCM encrypted ·
hold until certified · Teams only · manual lobby admit · Web-application
OAuth client.

## Phase A — Google connect (per-user) ✅
- [x] Migration `20260803000000_google.sql`: `google_accounts`, `calendar_links`, `send_records`, `meetings.certified_at`
- [x] `core/google/crypto.rs` AES-256-GCM (`GOOGLE_TOKEN_KEY`)
- [x] `core/google/config.rs` `GoogleConfig` + env (`GOOGLE_*`)
- [x] `core/google/store.rs` DB ops
- [x] `core/google/api.rs` token exchange/refresh, calendar list/get, gmail send, Teams URL regex
- [x] `server/google_handlers.rs`: `/google/status`, `/google/connect`, `/google/callback` (public, state nonce), account PATCH/DELETE

## Phase B — Scheduler + Teams auto-join ✅
- [x] `server/google_scheduler.rs`: poll every `GOOGLE_CALENDAR_POLL_INTERVAL_SECS` (300), dispatch window start−2min..+15min
- [x] Teams-only filter; dedupe via `calendar_links`; rollback link on dispatch failure
- [x] Stores `bot_id`, `calendar_event_id`, `platform`

## Phase C — Certification gate + email ✅
- [x] `PATCH /meetings/:id/certify` (`server/certify_handlers.rs`)
- [x] On certify: attendees from linked event → gmail .md send → `send_records` (idempotent)
- [x] Desktop: `certify_meeting` api_client command + "Certify & Send" button (SummaryPanel)
- [x] `.env.example` + `docs/GOOGLE_CALENDAR_SETUP.md` server section (guide lives in ai-meeting-agent repo)

## Phase D — OAuth consolidation (server-only) ✅
- [x] Desktop OAuth removed; server owns all credentials (meetily `0cd1ca6`)
- [x] `GET /google/meetings/:id/event` — link lookup, else search all accounts by time window, persist link
- [x] `POST /google/meetings/:id/send-minutes` — manual send with explicit recipients; shared idempotency with certify
- [x] `minutes_email.rs` shared helpers (`ensure_event_link`, `send_to_recipients`)
- [x] Poll interval 300s → 60s

## Verify
- [x] `cargo check` core+server clean; 7 google unit tests pass
- [x] meetily `cargo check` + `tsc --noEmit` clean
- [ ] Live e2e (needs real Google account + Teams event)

## Pre-existing issues found (not fixed)
- `core` test target didn't compile on main (`next_guest_index` cfg-gated fn, ungated test) — minimal fix applied (gate test + import) to unblock test runs
- 3 masked runtime test failures now visible: 2× `transcription::tests::test_merge_chunk_*`, 1× `voiceprint::tests::apply_speaker_identities_updates_db` — logic untouched by this work
