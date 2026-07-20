# Meetily

Cloud-First AI Meeting Assistant

Open Source • Privacy-Aware • Cloud-Ready

An AI meeting assistant that captures, transcribes, and summarizes meetings using cloud-based speech-to-text services. Connect to OpenAI-compatible APIs for accurate transcription and AI-powered summaries.

---

## Features

- **Cloud-First Transcription:** Connect to OpenAI-compatible STT APIs for accurate transcription
- **Real-time Transcription:** Get live transcripts as your meeting happens
- **AI-Powered Summaries:** Generate meeting summaries using your preferred AI provider
- **Multi-Platform:** Works on macOS, Windows, and Linux
- **Open Source:** Free to use and modify
- **Multiple AI Providers:** Support for Claude, Groq, OpenRouter, or custom OpenAI-compatible endpoints

## Installation

### Windows

1. Download the latest x64-setup.exe from the Releases page
2. Run the installer

### macOS

1. Download the .dmg file from the Releases page
2. Open the downloaded .dmg file
3. Drag Meetily to your Applications folder
4. Open Meetily from Applications folder

### Linux

Build from source following the build documentation in the docs folder.

Quick start:

```bash
git clone https://github.com/bmw-ece-ntust/meetily
cd meetily/frontend
pnpm install
pnpm run tauri:dev
```

## Key Features

### 🎯 AI-Powered Transcription

Transcribe meetings using the **ai-meeting-agent API**. Audio is recorded locally, then sent to the API server for processing.

### Import & Enhance

Import existing audio files to generate transcripts or re-transcribe recorded meetings with different settings.

Import existing audio files to generate transcripts, or enhance to re-transcribe any recorded meeting with a different language setting via the ai-meeting-agent API.

Generate meeting summaries with your choice of AI provider. Supports Claude, Groq, OpenRouter, and OpenAI-compatible endpoints.

### Custom OpenAI Endpoint Support

Use your own OpenAI-compatible endpoint for transcription and summaries. Perfect for organizations with custom infrastructure.

### Professional Audio Capture

<p align="center">
    <img src="docs/summary.png" width="650" style="border-radius: 10px;" alt="Summary generation" />
</p>

<p align="center">
    <img src="docs/editor1.png" width="650" style="border-radius: 10px;" alt="Editor Summary generation" />
</p>

### 🔒 Privacy-First Design

All data stays on your machine. Transcription models, recordings, and transcripts are stored locally.

<p align="center">
    <img src="docs/settings.png" width="650" style="border-radius: 10px;" alt="Local Transcription and storage" />
</p>

### 🌐 Custom OpenAI Endpoint Support

Use your own OpenAI-compatible endpoint for AI summaries. Perfect for organizations with custom AI infrastructure or preferred providers.

<p align="center">
    <img src="docs/custom.png" width="650" style="border-radius: 10px;" alt="Custom OpenAI Endpoint Configuration" />
</p>

### 🎙️ Professional Audio Mixing

Capture microphone and system audio simultaneously with intelligent ducking and clipping prevention.

<p align="center">
    <img src="docs/audio.png" width="650" style="border-radius: 10px;" alt="Device selection" />
</p>

## System Architecture

Meetily is a single, self-contained application built with [Tauri](https://tauri.app/). It uses a Rust-based backend to handle all the core logic, and a Next.js frontend for the user interface. Transcription is handled by the ai-meeting-agent REST API.

For more details, see the architecture documentation in the docs folder.

## For Developers

If you want to contribute or build from source, you'll need Rust and Node.js installed. For detailed build instructions, see the building documentation in the docs folder.

## Contributing

We welcome contributions from the community! If you have questions or suggestions, please open an issue or submit a pull request.

## License

MIT License - Feel free to use this project for your own purposes.

## Acknowledgments

- We borrowed some code from [Screenpipe](https://github.com/mediar-ai/screenpipe).
- We borrowed some code from [transcribe-rs](https://crates.io/crates/transcribe-rs).

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=Zackriya-Solutions/meetily&type=date&legend=top-left)](https://www.star-history.com/?repos=Zackriya-Solutions%2Fmeetily&type=date&legend=bottom-right)
