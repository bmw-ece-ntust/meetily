# Phase 4 — Implement Cloud-First Transcription

End state: a single `HttpSttProvider` (mirror of `LLMProvider::CustomOpenAI` at
`summary/llm_client.rs:75-180`) handles all STT by POSTing
`multipart/form-data` to `{endpoint}/v1/audio/transcriptions`.

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

## New types / code to add

- [ ] `CustomSttConfig` struct (`endpoint`, `api_key`, `model`, `response_format`, `language`?) in a new `frontend/src-tauri/src/stt/mod.rs`.
- [ ] `HttpSttProvider` impl of `TranscriptionProvider` trait (`audio/transcription/provider.rs:49-73`) — POSTs `multipart/form-data` to `{endpoint}/v1/audio/transcriptions` with `file`, `model`, optional `language`, `prompt`, `temperature`, `response_format="json"`. Parses `{"text": "..."}`.
- [ ] Tauri commands: `api_save_custom_stt_config`, `api_get_custom_stt_config`, `api_test_custom_stt_connection` (mirror the custom-openai triplet exactly; reuse error format).
- [ ] DB: new columns in `transcript_settings` (currently `id, provider, model, per-provider key columns` at `setting.rs:160-187`) — add `customSttEndpoint`, `customSttModel`, `customSttConfig` JSON column. Migration step needed.
- [ ] Reqwest client: confirm in `Cargo.toml` (should already be present, used by `openai/openai.rs:127`).

## Frontend

- [ ] `TranscriptSettings.tsx`: add `<SelectItem value="customStt">` and a sub-form (mirror the Custom-OpenAI UI at `ModelSettingsModal.tsx:948-1019`): endpoint, model, API key, optional advanced.
- [ ] Hook: `useCustomSttConfig()` parallel to existing custom-openai hooks.
- [ ] `ConfigContext.tsx`: surface `customStt` config to the rest of the app.

## Verification

- Test against an OpenAI-compatible STT endpoint (e.g. `faster-whisper-server`, `whisper.cpp --server`).
- Test against OpenAI's `api.openai.com/v1/audio/transcriptions` with a real key.
- Test with no key (local server) — header should be optional.
- Failure modes: bad endpoint, 401, 429, malformed multipart, slow response (timeout), non-JSON response.
