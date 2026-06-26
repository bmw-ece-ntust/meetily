# Phase 6 — Testing and Validation

**Source todo** (track completion here):
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/daily-logs/08_MeetingAgent.md`
— Phase 6 section.

## Files to read first

- `frontend/src-tauri/src/audio/transcription/` (existing audio prep)
- `frontend/src-tauri/src/audio/recording_commands.rs` (recording pipeline)

## Work

- [ ] Real-meeting test: 30-min meeting against a local `faster-whisper-server` instance, then against OpenAI's hosted Whisper. Compare accuracy and latency.
- [ ] Error-handling matrix: network down, 401, 429, 5xx, timeout, malformed audio.
- [ ] Audio format compatibility: confirm the existing audio pipeline (see study notes) produces format that the OpenAI `/v1/audio/transcriptions` endpoint accepts. If not, add a transcode step.
- [ ] Network-latency benchmark — document the results in the study notes.
