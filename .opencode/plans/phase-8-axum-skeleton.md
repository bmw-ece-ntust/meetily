# Phase 8 — Axum Skeleton

Goal: standalone HTTP server crate `server/` with DB pool, bearer auth, health/version endpoints.

## Tasks
- [x] Create `server/Cargo.toml` (axum, tokio, sqlx, reqwest, serde, tower-http, uuid, utoipa, chrono, log, env_logger, dirs, anyhow)
- [x] Add `server` to root workspace `Cargo.toml` members
- [x] `server/src/main.rs` — read env (`MEETILY_DATA_DIR` default `~/.meetily`, `MEETILY_API_KEY`, `MEETILY_PORT` default 8080), init DB pool, build router, graceful shutdown
- [x] `server/src/state.rs` — `AppState { db_manager }` (axum `State`)
- [x] `server/src/auth.rs` — bearer token middleware (compares `Authorization: Bearer <key>` to `MEETILY_API_KEY`)
- [x] `server/src/error.rs` — `ApiError` enum → `(StatusCode, Json)` via `IntoResponse`
- [x] `server/src/db/mod.rs` + `manager.rs` + `models.rs` — Tauri-free `DatabaseManager` (path-based, no `app_handle`)
- [x] Copy migrations `frontend/src-tauri/migrations/` → `server/migrations/`
- [x] `server/src/routes/mod.rs` + `health.rs` — `GET /health`, `GET /version`
- [x] `cargo check` passes

## Out of scope
- Meeting/transcript/summary/import/retranscription endpoints (Phases 9-12)
- Deleting Tauri or frontend (Phase 13)
- Moving provider clients, transcription, summary modules (later phases)

## Data dir
`MEETILY_DATA_DIR` env (default `~/.meetily`). DB at `{data_dir}/meeting_minutes.sqlite`. Migrations run on startup.

## Verification
- `cargo check -p meetily-server` 0 errors ✅
- `MEETILY_API_KEY=test cargo run` → server listens on :8080 ✅
- `curl localhost:8080/health` → 200 (no auth required) ✅
- `curl localhost:8080/version` → 200 (no auth required) ✅
- `curl -H "Authorization: Bearer wrong" localhost:8080/health` → still 200 (health exempt) ✅
- DB migrations run on startup (9 tables created) ✅
- Swagger UI at `/docs` ✅
