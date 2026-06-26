# Phase 11 — Import Endpoint + SSE

Goal: Port audio import + transcription pipeline from `audio/import.rs` to HTTP endpoint with SSE progress.

## Tasks
- [ ] `server/src/routes/import.rs`:
  - `POST /import` (multipart: `file`, `title`, `language?`, `model?`, `provider?`) — spawns background import job, returns `job_id`
  - `POST /import/validate` — validate audio file metadata without starting import
  - `GET /import/{job_id}/status` — poll job status (stage, progress %, message)
  - `GET /import/{job_id}/events` — SSE stream of import progress events (progress/warning/complete/error)
  - `POST /import/{job_id}/cancel` — cancel ongoing import
- [ ] `server/src/services/import.rs` — extract core import logic from `frontend/src-tauri/src/audio/import.rs`:
  - File validation (format detection via symphonia/ffmpeg-sidecar)
  - Audio chunking + transcription pipeline
  - Progress tracking with `DashMap<job_id, ImportJobState>`
  - Cancellation tokens
  - Save transcript segments to DB + create meeting
- [ ] `server/src/transcription/` — move from `frontend/src-tauri/src/audio/transcription/`:
  - `engine.rs` (TranscriptionEngine factory)
  - Provider impls: `deepgram.rs`, `elevenlabs.rs`, `groq.rs`, `openai.rs`, `custom.rs`
  - Strip Tauri `app.emit()` → replace with channel-based progress reporting
- [ ] `server/src/state.rs` — add `import_jobs: Arc<DashMap<String, ImportJob>>` to AppState
- [ ] Imported audio stored at `{data_dir}/recordings/{meeting_id}/`
- [ ] SSE event types: `progress` (stage, percentage, message), `warning`, `complete` (meeting_id, title, segments_count), `error`
- [ ] Register routes under auth layer + utoipa annotations
- [ ] `cargo check` passes

## Out of scope
- Summary generation, retranscription endpoints (Phase 12)
- Deleting Tauri/frontend (Phase 13)

## Verification
- `cargo check -p meetily-server` 0 errors
- `curl -X POST -H "Authorization: Bearer test" -F "file=@test.mp3" -F "title=Test" localhost:8080/import` → 200 `{job_id}`
- `curl -H "Authorization: Bearer test" localhost:8080/import/{job_id}/status` → 200
- `curl -H "Authorization: Bearer test" -N localhost:8080/import/{job_id}/events` → SSE stream
- `curl -X POST -H "Authorization: Bearer test" localhost:8080/import/{job_id}/cancel` → 200
- `/docs` shows all new endpoints
