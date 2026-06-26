# Phase 4 — Implement Cloud-First Transcription

End state: add `customStt` as a **7th provider option** (alongside `deepgram`, `elevenLabs`, `groq`, `openai`) that allows users to configure any OpenAI-compatible `/v1/audio/transcriptions` endpoint. Mirrors the `CustomOpenAI` pattern from the LLM system.

**Source todo** (track completion here):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/daily-logs/08_MeetingAgent.md`
— Phase 4 section.

**Study notes** (architecture context):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/study-notes/14_Meetily_Cloud_First_Transcription.md`

## Files to read first

- `frontend/src-tauri/src/summary/mod.rs:14-31` — existing `CustomOpenAIConfig` shape to mirror
- `frontend/src-tauri/src/summary/llm_client.rs:75-243` — CustomOpenAI arm
- `frontend/src-tauri/src/api/api.rs:1172-1300` — `api_save/get/test_custom_openai_config` triplet
- `frontend/src-tauri/src/lib.rs:657-659` — Tauri command registration site
- `frontend/src/components/ModelSettingsModal.tsx:948-1019` — Custom-OpenAI sub-form pattern to mirror

## Architecture

**Add `customStt` as 7th provider** (not a replacement):
- Existing: `deepgram`, `elevenLabs`, `groq`, `openai` (keep these intact)
- New: `customStt` — user-configurable OpenAI-compatible endpoint

## New types / code to add

### Backend (Rust)
- [ ] `CustomSttConfig` struct in new `frontend/src-tauri/src/stt/mod.rs`:
  - `endpoint: String` (e.g., `"http://localhost:8000/v1"`)
  - `api_key: Option<String>`
  - `model: String` (e.g., `"whisper-1"`, `"large-v3"`)
  - Optional: `language`, `temperature`, `response_format`
- [ ] `CustomSttProvider` impl of `TranscriptionProvider` trait:
  - POSTs `multipart/form-data` to `{endpoint}/v1/audio/transcriptions`
  - Fields: `file`, `model`, optional `language`, `prompt`, `temperature`
  - Parses `{"text": "..."}` response
- [ ] Tauri commands (mirror custom-openai pattern):
  - `api_save_custom_stt_config`
  - `api_get_custom_stt_config`
  - `api_test_custom_stt_connection`
- [ ] DB: Add `customSttConfig` JSON column to `transcript_settings` table
- [ ] Update `audio/transcription/engine.rs` to handle `customStt` provider case

### Frontend (TypeScript/React)
- [ ] Add `customStt` to `TranscriptModelProps` provider union type
- [ ] In `TranscriptSettings.tsx`, add `<SelectItem value="customStt">🔧 Custom STT</SelectItem>` at top of dropdown
- [ ] Add conditional sub-form when `provider === 'customStt'` (mirror `ModelSettingsModal.tsx:948-1019`):
  - Endpoint URL input (required)
  - Model name input (required)
  - API key input (optional, type="password")
  - Advanced options (collapsible): temperature, language, etc.
  - Test connection button
- [ ] Create hook `useCustomSttConfig()` to manage state and API calls
- [ ] Update `ConfigContext.tsx` to surface custom STT config

## Verification

- [ ] Test against local `faster-whisper-server` (`http://localhost:8000/v1`)
- [ ] Test against OpenAI's hosted endpoint (`https://api.openai.com/v1`)
- [ ] Test against Groq's OpenAI-compatible endpoint
- [ ] Test with no API key (local server without auth)
- [ ] Test error handling: bad endpoint, 401, 429, timeout, malformed response
- [ ] Verify audio format compatibility (existing pipeline should work)
- [ ] Test provider switching: switch from `customStt` → `openai` → `deepgram` → back to `customStt`
