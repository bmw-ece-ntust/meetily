# API Reference

Meetily's app-to-backend communication happens entirely through [Tauri commands and events](https://tauri.app/v1/guides/features/command/). There is no public HTTP API for the current desktop application.

## Transcription Providers

Audio is sent to a cloud STT provider over HTTPS. Supported providers (configured in Transcript Settings):

- **Deepgram** — `https://api.deepgram.com/v1/listen`
- **ElevenLabs** — `https://api.elevenlabs.io/v1/speech-to-text`
- **Groq** — `https://api.groq.com/openai/v1/audio/transcriptions`
- **OpenAI** — `https://api.openai.com/v1/audio/transcriptions`
- **Custom** — any OpenAI-compatible `/v1/audio/transcriptions` endpoint (self-hosted Whisper, faster-whisper-server, etc.)

All providers use the same Multipart form upload (`file`, `model`, optional `language`, `response_format`).

## LLM Providers (Summaries)

- Claude
- Groq
- OpenAI
- OpenRouter
- Ollama (local)
- Custom OpenAI-compatible endpoint

## Tauri Commands

The Tauri command surface is internal to the app and is not a stable public API. If you are extending the app, see `frontend/src-tauri/src/` and `frontend/src-tauri/src/api/api.rs`.

## Archived Material

Earlier Meetily development flows used a standalone whisper-server HTTP API. That backend has been removed; this document is retained only as a marker for old branches.
