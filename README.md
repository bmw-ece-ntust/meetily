# Meetily

Privacy-First AI Meeting Assistant

Open Source • Privacy-First • Cloud-Ready

A privacy-first AI meeting assistant that captures, transcribes, and summarizes meetings. Built with data sovereignty in mind - process locally or connect to your preferred cloud provider. Perfect for professionals who need meeting intelligence with full control over their data.

---

## Features

- **Flexible Transcription:** Choose between local processing or cloud-based OpenAI-compatible APIs
- **Real-time Transcription:** Get live transcripts as your meeting happens
- **AI-Powered Summaries:** Generate meeting summaries using your preferred AI provider
- **Multi-Platform:** Works on macOS, Windows, and Linux
- **Open Source:** Free to use and modify
- **Multiple AI Providers:** Support for Ollama (local), Claude, Groq, OpenRouter, or custom OpenAI-compatible endpoints

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
git clone https://github.com/KagChi/meetily
cd meetily/frontend
pnpm install
pnpm tauri build
```

## Key Features

### Flexible Transcription

Choose your transcription approach - process locally or connect to cloud APIs for enhanced accuracy.

### Import & Enhance

Import existing audio files to generate transcripts or re-transcribe recorded meetings with different settings.

### AI-Powered Summaries

Generate meeting summaries with your choice of AI provider. Supports Ollama (local), Claude, Groq, OpenRouter, and OpenAI-compatible endpoints.

### Privacy-First Design

All data stays on your machine. Recordings and transcripts are stored locally with optional cloud processing.

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

## Acknowledgments

- Code borrowed from Whisper.cpp
- Code borrowed from Screenpipe
- Code borrowed from transcribe-rs
- Thanks to NVIDIA for the Parakeet model
