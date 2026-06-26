<div align="center" style="border-bottom: none">
    <h1>
        <img src="docs/Meetily-6.png" style="border-radius: 10px;" />
        <br>
        Privacy-First AI Meeting Assistant
    </h1>
    <br>
    <br>
    <a href="https://github.com/KagChi/meetily/releases/"><img src="https://img.shields.io/badge/Release-Link-brightgreen" alt="Release"></a>
    <a href="https://github.com/KagChi/meetily/releases"><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/KagChi/meetily?style=flat"></a>
    <a href="https://github.com/KagChi/meetily/releases"><img src="https://img.shields.io/badge/License-MIT-blue" alt="License"></a>
    <a href="https://github.com/KagChi/meetily/releases"><img src="https://img.shields.io/badge/Supported_OS-macOS,_Windows,_Linux-white" alt="Supported OS"></a>
    <br>
    <h3>
    <br>
    Open Source • Privacy-First • Cloud-Ready
    </h3>
    <p align="center">

A privacy-first AI meeting assistant that captures, transcribes, and summarizes meetings. Built with data sovereignty in mind - process locally or connect to your preferred cloud provider. Perfect for professionals who need meeting intelligence with full control over their data.

</p>

<p align="center">
    <img src="docs/meetily_demo.gif" width="650" alt="Meetily Demo" />
</p>

</div>

---

## Features

- **Flexible Transcription:** Choose between local processing or cloud-based OpenAI-compatible APIs
- **Real-time Transcription:** Get live transcripts as your meeting happens
- **AI-Powered Summaries:** Generate meeting summaries using your preferred AI provider
- **Multi-Platform:** Works on macOS, Windows, and Linux
- **Open Source:** Free to use and modify
- **Multiple AI Providers:** Support for Ollama (local), Claude, Groq, OpenRouter, or custom OpenAI-compatible endpoints

## Installation

### 🪟 **Windows**

1. Download the latest `x64-setup.exe` from [Releases](https://github.com/KagChi/meetily/releases/latest)
2. Run the installer

### 🍎 **macOS**

1. Download the `.dmg` file from [Releases](https://github.com/KagChi/meetily/releases/latest)
2. Open the downloaded `.dmg` file
3. Drag **Meetily** to your Applications folder
4. Open **Meetily** from Applications folder

### 🐧 **Linux**

Build from source following our detailed guides:

- [Building on Linux](docs/building_in_linux.md)
- [General Build Instructions](docs/BUILDING.md)

**Quick start:**

```bash
git clone https://github.com/KagChi/meetily
cd meetily/frontend
pnpm install
pnpm tauri build
```

## Key Features

### 🎯 Flexible Transcription

Choose your transcription approach - process locally or connect to cloud APIs for enhanced accuracy.

<p align="center">
    <img src="docs/home.png" width="650" style="border-radius: 10px;" alt="Meetily Demo" />
</p>

### 📥 Import & Enhance

Import existing audio files to generate transcripts or re-transcribe recorded meetings with different settings.

<p align="center">
    <img src="docs/meetily-export.gif" width="650" style="border-radius: 10px;" alt="Import and Enhance" />
</p>

### 🤖 AI-Powered Summaries

Generate meeting summaries with your choice of AI provider. Supports Ollama (local), Claude, Groq, OpenRouter, and OpenAI-compatible endpoints.

<p align="center">
    <img src="docs/summary.png" width="650" style="border-radius: 10px;" alt="Summary generation" />
</p>

<p align="center">
    <img src="docs/editor1.png" width="650" style="border-radius: 10px;" alt="Editor Summary generation" />
</p>

### 🔒 Privacy-First Design

All data stays on your machine. Recordings and transcripts are stored locally with optional cloud processing.

<p align="center">
    <img src="docs/settings.png" width="650" style="border-radius: 10px;" alt="Settings" />
</p>

### 🌐 Custom OpenAI Endpoint Support

Use your own OpenAI-compatible endpoint for transcription and summaries. Perfect for organizations with custom infrastructure.

<p align="center">
    <img src="docs/custom.png" width="650" style="border-radius: 10px;" alt="Custom OpenAI Endpoint Configuration" />
</p>

### 🎙️ Professional Audio Capture

Capture microphone and system audio simultaneously with intelligent mixing and clipping prevention.

<p align="center">
    <img src="docs/audio.png" width="650" style="border-radius: 10px;" alt="Audio settings" />
</p>

## System Architecture

Meetily is built with [Tauri](https://tauri.app/), using a Rust backend for core logic and a Next.js frontend for the user interface.

For more details, see the [Architecture documentation](docs/architecture.md).

## For Developers

If you want to contribute or build from source, you'll need Rust and Node.js installed. For detailed build instructions, see the [Building from Source guide](docs/BUILDING.md).

## Contributing

We welcome contributions from the community! If you have questions or suggestions, please open an issue or submit a pull request. For more details, refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

MIT License - Feel free to use this project for your own purposes.

## Acknowledgments

- Code borrowed from Whisper.cpp
- Code borrowed from Screenpipe
- Code borrowed from transcribe-rs
- Thanks to NVIDIA for the Parakeet model
