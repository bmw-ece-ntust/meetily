# Phase 13 — Delete Tauri + Frontend, Clean Workspace, Finalize OpenAPI

Goal: Remove all Tauri + GUI code. Finalize server crate as sole binary. Update docs.

## Tasks
- [ ] Delete `frontend/` directory entirely (all TS, React, Tauri Rust, configs)
- [ ] Delete `frontend/src-tauri/` (Tauri backend, all 131 commands, audio capture, notifications, analytics, onboarding, console, recording)
- [ ] Remove `frontend/src-tauri` from root `Cargo.toml` workspace members (keep only `server`)
- [ ] Delete GUI-only scripts:
  - `scripts/generate-update-manifest-github.js` (Tauri OTA)
  - `scripts/test-update-locally.js` (Tauri OTA test server)
- [ ] Keep `scripts/inject_transcript.py` (still useful for CLI DB injection)
- [ ] Move/rename `server/` content if needed (or keep as-is if workspace clean)
- [ ] Clean root `Cargo.toml` — remove `[patch.crates-io]` for `cpal`/`esaxx-rs` (audio deps no longer needed)
- [ ] Clean `Cargo.lock` (`cargo update` or fresh lock)
- [ ] Confirm no dangling Tauri references: `rg -i "tauri|app_handle|AppHandle|invoke_handler|tauri::" --glob '!*.md'`
- [ ] Finalize utoipa OpenAPI spec:
  - Consolidate all `#[openapi]` docs into single `ApiDoc` in `main.rs`
  - Verify `/docs` (Swagger UI) renders all endpoints
  - Export `openapi.json` for CLI consumers
- [ ] Update docs:
  - `CLAUDE.md` — replace Tauri build/test/conventions with server crate equivalents
  - `frontend/API.md` → move to root `API.md`, rewrite for HTTP API
  - `README.md` — update quickstart (cargo run, env vars, curl examples)
  - Delete `BLUETOOTH_PLAYBACK_NOTICE.md` (audio capture gone)
- [ ] `cargo build` passes (full workspace)
- [ ] `cargo test` passes (if any tests exist)

## Out of scope
- Nothing — this is the final phase

## Verification
- `cargo build` 0 errors (only `meetily-server` in workspace)
- `rg -i "tauri" --glob '!*.md'` → 0 matches
- `ls frontend/` → "No such file or directory"
- `MEETILY_API_KEY=test cargo run` → server starts
- Full round-trip smoke test:
  1. `POST /import` (upload audio) → `job_id`
  2. `GET /import/{job_id}/events` (SSE) → `complete`
  3. `GET /meetings` → list includes new meeting
  4. `GET /meetings/{id}/transcripts` → transcript segments
  5. `POST /meetings/{id}/summary` → spawn summary
  6. `GET /meetings/{id}/summary/events` (SSE) → `complete`
  7. `GET /meetings/{id}/summary` → summary JSON
  8. `POST /meetings/{id}/retranscribe` → spawn retranscription
  9. `GET /meetings/{id}/retranscribe/events` (SSE) → `complete`
  10. `DELETE /meetings/{id}` → 200
- `/docs` renders complete Swagger UI with all endpoints
- `API.md` accurate, `README.md` quickstart works
