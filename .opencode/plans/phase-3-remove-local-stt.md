# Phase 3 — Remove Local Transcription Dependencies

End state: no `whisper_engine` / `parakeet_engine` code paths reachable from
production builds, no model download/storage, no local-model UI.

**Source todo** (track completion here):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/daily-logs/08_MeetingAgent.md`
— Phase 3 section.

**Study notes** (architecture context):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/study-notes/14_Meetily_Cloud_First_Transcription.md`

## Files to read first (read-only, before any delete)

- `frontend/src-tauri/src/whisper_engine/` — full tree: `whisper_engine.rs`, `commands.rs`, `parallel_processor.rs`, `acceleration.rs`, `system_monitor.rs`, `_stderr_suppressor.rs`
- `frontend/src-tauri/src/parakeet_engine/` — full tree
- `frontend/src-tauri/src/audio/transcription/engine.rs` — dispatch (the `localWhisper | _ =>` Whisper fallback at line ~215 is the most subtle bit)
- `frontend/src-tauri/src/audio/transcription/provider.rs` — `TranscriptionProvider` trait
- `frontend/src-tauri/Cargo.toml` — find whisper-rs, ONNX runtime, Metal/CUDA/Vulkan features, model-download crates
- `frontend/src/components/TranscriptSettings.tsx`, `WhisperModelManager.tsx`, `ParakeetModelManager.tsx`, `useTranscriptionModels.ts`, `lib/whisper.ts`

## Decisions needed before editing

- DB schema: keep `transcript_settings` table but constrain `provider` to a single value (`customStt`), or drop the table entirely and use a new minimal one?
- Single replacement provider or multi (Custom + OpenAI + Groq + Deepgram)? Cloud-first implies single HTTP backend for simplicity — confirm.
- What does `api_save_model_config.whisper_model` (legacy string field) become — `null`/`""`, or alias it to the custom STT `model` field?

## Work

- [ ] Delete `frontend/src-tauri/src/whisper_engine/` and `parakeet_engine/` directories.
- [ ] Remove `whisper_*` and `parakeet_*` Tauri command registrations from `lib.rs:558-597` and `:571-584`.
- [ ] In `audio/transcription/engine.rs`, reduce `TranscriptionEngine` enum to a single variant (or `Provider(HttpSttProvider)`), and route `localWhisper | _ =>` arm in `get_or_init_transcription_engine` to it.
- [ ] Delete `WhisperProvider` and `ParakeetProvider` impls; the `TranscriptionProvider` trait stays.
- [ ] `Cargo.toml`: drop whisper-rs, ONNX runtime, model-download crates, Metal/CUDA/Vulkan feature flags. Audit transitive build-script deps.
- [ ] Drop the `app_data/models/` and `app_data/models/parakeet/` directory-creation in `set_models_directory` / `parakeet_engine.rs:126-146`; no replacement.
- [ ] DB migration: in `database/repositories/setting.rs`, drop whisper/parakeet-specific INSERT branches in `save_transcript_config` (`:153-173`); keep the row but only allow `customStt` provider.
- [ ] Frontend: collapse `TranscriptSettings.tsx` provider `<Select>` to one option; delete `WhisperModelManager.tsx`, `ParakeetModelManager.tsx`, `ModelDownloadProgress.tsx`, `useTranscriptionModels.ts`; strip `WhisperAPI` from `lib/whisper.ts` (delete the file if it becomes empty).
- [ ] Update `docs/architecture.md` STT section to cloud-only.
- [ ] Update `docs/BUILDING.md` — drop model-download/build steps.
- [ ] Update `.github/workflows/*` — drop model-cache steps.

## Verification after each step

- `pnpm tauri build` (or `cargo check` for Rust-only edits) compiles clean.
- `rg -i "whisper|parakeet" frontend/src frontend/src-tauri/src` returns only intentional references (e.g. UI labels being removed).
- Frontend starts; no console errors about missing Tauri commands.
