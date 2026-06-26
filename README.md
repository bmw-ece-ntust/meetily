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
pnpm tauri build
```

## Key Features

### Cloud-Based Transcription

Connect to any OpenAI-compatible speech-to-text API for accurate, real-time transcription.

### Import & Enhance

Import existing audio files to generate transcripts or re-transcribe recorded meetings with different settings.

### AI-Powered Summaries

Generate meeting summaries with your choice of AI provider. Supports Claude, Groq, OpenRouter, and OpenAI-compatible endpoints.

### Custom OpenAI Endpoint Support

Use your own OpenAI-compatible endpoint for transcription and summaries. Perfect for organizations with custom infrastructure.

### Professional Audio Capture

Capture microphone and system audio simultaneously with intelligent mixing and clipping prevention.

## System Architecture

Meetily is built with Tauri, using a Rust backend for core logic and a Next.js frontend for the user interface.

For more details, see the architecture documentation in the docs folder.

## For Developers

If you want to contribute or build from source, you'll need Rust and Node.js installed. For detailed build instructions, see the building documentation in the docs folder.

## Contributing

We welcome contributions from the community! If you have questions or suggestions, please open an issue or submit a pull request.

## License

MIT License - Feel free to use this project for your own purposes.
