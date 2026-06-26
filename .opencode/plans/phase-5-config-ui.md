# Phase 5 — Configuration and UI Updates

End state: the cloud-first STT path is the only path in the UI; credentials
are stored securely; no trace of the local model management remains.

**Source todo** (track completion here):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/daily-logs/08_MeetingAgent.md`
— Phase 5 section.

## Files to read first

- `frontend/src/components/TranscriptSettings.tsx` (after Phase 4 edits)
- `frontend/src/components/ModelSettingsModal.tsx` (existing secure-storage pattern)
- `frontend/src/contexts/ConfigContext.tsx`
- `frontend/src-tauri/src/api/api.rs` (save/get patterns)

## Work

- [ ] Design the unified config form: one provider, one form, in `TranscriptSettings.tsx`.
- [ ] Secure credential storage — confirm whether `tauri-plugin-store` (already in `lib.rs:410`) is sufficient for API keys, or whether OS keychain is required.
- [ ] Connection-status indicator (green/red dot near endpoint field); reuses the test-connection command from Phase 4.
- [ ] Usage / cost tracker: optional. Requires the upstream STT API to return token counts, which most OpenAI-compatible endpoints do.
- [ ] Remove dead UI: any "Models" / "Downloads" sub-pages that referenced Whisper/Parakeet.

## Verification

- Empty state: first-launch user lands on the cloud-first config form.
- Saved state: reopening restores the endpoint + masked API key.
- Toggling fields does not leak the key to logs (`rg` the key in `target/` after a save cycle).
