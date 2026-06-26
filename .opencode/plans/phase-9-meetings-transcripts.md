# Phase 9 — Meetings + Transcripts + Search Endpoints

Goal: Port meeting/transcript/search logic from `api/api.rs` to axum routes.

## Tasks
- [ ] `server/src/routes/meetings.rs` — port these from `api/api.rs`:
  - `GET /meetings` (← `api_get_meetings`)
  - `GET /meetings/{id}` (← `api_get_meeting`)
  - `GET /meetings/{id}/metadata` (← `api_get_meeting_metadata`, pagination)
  - `GET /meetings/{id}/transcripts?limit&offset` (← `api_get_meeting_transcripts`)
  - `PATCH /meetings/{id}` (← `api_save_meeting_title`)
  - `DELETE /meetings/{id}` (← `api_delete_meeting`)
  - `GET /search?q=` (← `api_search_transcripts`)
- [ ] `server/src/db/repositories/` — copy from `frontend/src-tauri/src/database/repositories/`:
  - `MeetingsRepository`
  - `TranscriptsRepository`
  - `TranscriptChunksRepository`
  - `SummaryProcessesRepository`
  - `SettingsRepository`
- [ ] Strip Tauri-specific imports/args from repositories (replace `tauri::State` with `&SqlitePool`)
- [ ] Define request/response DTOs with serde + utoipa annotations
- [ ] Register routes in `build_router()` under auth layer
- [ ] Add utoipa `#[utoipa::path]` annotations to all endpoints
- [ ] `cargo check` passes

## Out of scope
- Config, models, import, summary, retranscription endpoints (Phases 10-12)
- Deleting Tauri/frontend (Phase 13)

## Verification
- `cargo check -p meetily-server` 0 errors
- `curl -H "Authorization: Bearer test" localhost:8080/meetings` → 200 `[]` (empty DB)
- `curl -H "Authorization: Bearer test" localhost:8080/search?q=hello` → 200 `[]`
- `curl -H "Authorization: Bearer test" localhost:8080/meetings/nonexistent` → 404
- `curl localhost:8080/meetings` (no auth) → 401
- `/docs` shows all new endpoints
