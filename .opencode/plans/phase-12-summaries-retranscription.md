# Phase 12 — Summaries + Retranscription Endpoints + SSE

Goal: Port summary generation + retranscription to HTTP endpoints with SSE.

## Tasks
- [ ] `server/src/routes/summaries.rs`:
  - `POST /meetings/{id}/summary` (← `api_process_transcript`) — spawn background summary generation, return process status
  - `GET /meetings/{id}/summary` (← `api_get_summary`) — get summary status + data
  - `POST /meetings/{id}/summary/cancel` (← `api_cancel_summary`) — cancel via CancellationToken
  - `PUT /meetings/{id}/summary` (← `api_save_meeting_summary`) — save/overwrite summary JSON
  - `GET /meetings/{id}/summary/events` — SSE stream of summary generation progress
  - `POST /summary/detect-language` (← `api_detect_transcript_summary_language`) — if not done in Phase 10
- [ ] `server/src/summary/` — move full summary engine from `frontend/src-tauri/src/summary/`:
  - `commands.rs` core logic (process_transcript, get_summary, cancel, save)
  - `summary_engine/` (ModelManager, chunking, LLM calls)
  - Strip Tauri `app.emit()` → replace with channel-based progress
  - `CancellationTokens` stored in `DashMap<meeting_id, CancellationToken>`
- [ ] `server/src/routes/retranscription.rs`:
  - `POST /meetings/{id}/retranscribe` (← `start_retranscription_command`) — spawn background retranscription
  - `POST /meetings/{id}/retranscribe/cancel` (← `cancel_retranscription_command`)
  - `GET /meetings/{id}/retranscribe/status` (← `is_retranscription_in_progress_command`)
  - `GET /meetings/{id}/retranscribe/events` — SSE stream
- [ ] `server/src/services/retranscription.rs` — extract from `frontend/src-tauri/src/audio/retranscription.rs`:
  - Load meeting audio from folder_path
  - Chunk + transcribe via TranscriptionEngine
  - Replace existing transcripts
  - Progress tracking + cancellation
- [ ] `server/src/state.rs` — add `summary_jobs: Arc<DashMap<String, SummaryJob>>`, `retranscription_jobs: Arc<DashMap<String, RetranscriptionJob>>`
- [ ] SSE event types: summary (progress/complete/error), retranscription (progress/complete/error)
- [ ] Register routes under auth layer + utoipa annotations
- [ ] `cargo check` passes

## Out of scope
- Deleting Tauri/frontend (Phase 13)

## Verification
- `cargo check -p meetily-server` 0 errors
- `curl -X POST -H "Authorization: Bearer test" localhost:8080/meetings/{id}/summary` → 200 (spawns job)
- `curl -H "Authorization: Bearer test" localhost:8080/meetings/{id}/summary` → 200 (status)
- `curl -H "Authorization: Bearer test" -N localhost:8080/meetings/{id}/summary/events` → SSE stream
- `curl -X POST -H "Authorization: Bearer test" localhost:8080/meetings/{id}/retranscribe` → 200
- `/docs` shows all new endpoints
- Round-trip: import → SSE → transcripts → summary → get summary → retranscribe → SSE → new transcripts
