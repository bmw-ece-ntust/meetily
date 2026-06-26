# Phase 3 — Remove Local Transcription Dependencies

End state: no `whisper_engine` / `parakeet_engine` code paths reachable from
production builds, no model download/storage, no local-model UI. **Keep all existing cloud providers** (`deepgram`, `elevenLabs`, `groq`, `openai`) intact.

**Source todo** (track completion here):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/daily-logs/08_MeetingAgent.md`
— Phase 3 section.

**Study notes** (architecture context):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/study-notes/14_Meetily_Cloud_First_Transcription.md`

## Architecture Decision

**Multi-provider model** (matches LLM system):
- Remove: `localWhisper`, `parakeet` (local providers)
- Keep: `deepgram`, `elevenLabs`, `groq`, `openai` (existing cloud providers)
- Add in Phase 4: `customStt` (7th provider for any OpenAI-compatible endpoint)

Users can switch providers on-the-fly via the dropdown.

## Files to read first (read-only, before any delete)

- `frontend/src-tauri/src/whisper_engine/` — full tree: `whisper_engine.rs`, `commands.rs`, `parallel_processor.rs`, `acceleration.rs`, `system_monitor.rs`, `_stderr_suppressor.rs`
- `frontend/src-tauri/src/parakeet_engine/` — full tree
- `frontend/src-tauri/src/audio/transcription/engine.rs` — dispatch (the `localWhisper | _ =>` Whisper fallback at line ~215 is the most subtle bit)
- `frontend/src-tauri/src/audio/transcription/provider.rs` — `TranscriptionProvider` trait
- `frontend/src-tauri/Cargo.toml` — find whisper-rs, ONNX runtime, Metal/CUDA/Vulkan features, model-download crates
- `frontend/src/components/TranscriptSettings.tsx`, `WhisperModelManager.tsx`, `ParakeetModelManager.tsx`, `useTranscriptionModels.ts`, `lib/whisper.ts`

## Decisions (resolved)

- DB schema: **Keep `transcript_settings` table**, just remove `localWhisper`/`parakeet` logic. Existing cloud provider columns stay.
- Providers: **Multi-provider** — keep existing cloud providers, add `customStt` in Phase 4.
- Legacy `whisper_model` field: Set to `null` when migrating away from local providers.

## Work

### Backend (Rust)
- [x] Delete `frontend/src-tauri/src/whisper_engine/` directory (8 files, ~109KB).
- [x] Delete `frontend/src-tauri/src/parakeet_engine/` directory.
- [x] Remove `whisper_*` and `parakeet_*` Tauri command registrations from `lib.rs`.
- [x] In `audio/transcription/engine.rs`, remove `localWhisper` branch from `get_or_init_transcription_engine`; route to error or placeholder.
- [x] Delete `WhisperProvider` and `ParakeetProvider` trait impls from `audio/transcription/provider.rs` (keep the trait itself).
- [x] `Cargo.toml`: remove whisper-rs, ONNX runtime, model-download crates, Metal/CUDA/Vulkan feature flags.
- [x] Remove `app_data/models/` and `app_data/models/parakeet/` directory-creation logic.

### Database
- [x] In `database/repositories/setting.rs`, remove `"localWhisper"` and `"parakeet"` branches from `save_transcript_api_key` (`:180-192`).
- [x] Keep `transcript_settings` table structure intact (existing cloud provider columns stay).

### Frontend (TypeScript/React)
- [x] In `TranscriptSettings.tsx`, remove `<SelectItem value="localWhisper">` and `<SelectItem value="parakeet">` from dropdown.
- [x] Remove conditional rendering for `localWhisper` and `parakeet`.
- [x] Delete `WhisperModelManager.tsx` component.
- [x] Delete `ParakeetModelManager.tsx` component.
- [x] Delete `ModelDownloadProgress.tsx`.
- [x] Delete `useTranscriptionModels.ts` hook.
- [x] Delete `lib/whisper.ts` and `lib/parakeet.ts`.
- [x] Update `TranscriptModelProps` type to remove `'localWhisper' | 'parakeet'`.
- [x] Uncomment existing cloud providers in `TranscriptSettings.tsx`.
- [x] Add Save button to `TranscriptSettings.tsx` (was missing — provider/model/apiKey never persisted to backend).
- [x] Wire `api_save_transcript_config` + emit `transcript-config-updated` event.
- [x] Fix `api_get_transcript_config` fallback: `parakeet`/`DEFAULT_PARAKEET_MODEL` → `deepgram`/`nova-2`.
- [x] Update `useModalState.ts`: drop `model-download-complete` listener (no local model downloads).
- [x] Update `LanguageSelection.tsx`: drop `isParakeet` branch, narrow `provider` type to cloud-only.
- [x] Default providers in `ConfigContext.tsx`, `Sidebar/index.tsx`, `settings/page.tsx`: `parakeet` → `deepgram`.
- [x] `TranscriptPanel.tsx`: Language button always visible (was gated to `localWhisper`).

### Documentation
- [x] Update `docs/architecture.md` STT section to reflect cloud-only approach.
- [x] Delete `docs/GPU_ACCELERATION.md` (entirely about whisper-rs).
- [x] Update `frontend/README.md` features list — cloud STT instead of local Whisper.
- [x] Update `CLAUDE.md` Project Overview, tech stack, architecture diagram, pipeline, gotchas.
- [x] Replace `frontend/API.md` (was legacy whisper-server archive marker).
- [x] Update `frontend/src-tauri/LOGGING_OPTIMIZATIONS.md` (removed whisper_engine-specific refs).

### Build / scripts
- [x] Strip GPU-specific npm scripts (`tauri:dev:metal`, `tauri:build:metal`, etc.).
- [x] Delete GPU build/dev wrappers (`build-gpu.{bat,ps1,sh}`, `dev-gpu.{bat,ps1,sh}`, `build_backup.bat`).
- [x] Delete `scripts/auto-detect-gpu.js`.
- [x] Simplify `scripts/tauri-auto.js` (no auto-detection).
- [x] Migrate `build.bat`/`build.ps1` to pnpm + non-GPU build target.
- [x] Delete `backend/` directory (legacy Python/FastAPI archive, unsupported per its README).
- [x] Re-add `zip`/`tar`/`xz2` build-deps to `Cargo.toml` (needed by `build/ffmpeg.rs`, not Whisper).
- [x] Strip GPU-detection from `build.rs`.
- [x] Remove `externalBin` llama-helper from `tauri.conf.json` (local LLM sidecar not used).

### Verification
- [x] `cargo check`: 0 errors, 5 cosmetic warnings.
- [x] `npx tsc --noEmit`: 0 errors (one pre-existing `bun:test` import in orphaned test, not in build path).
- [x] `npx next build`: 11/11 static pages generated, 0 errors.
- [x] `rg -i "whisper|parakeet" frontend/src frontend/src-tauri/src`: only intentional references (CLAUDE.md historical context, comment-only mentions in post_processor.rs, lib_old_complex.rs legacy).
