# 🎙️ Kokoro Reader

> **A local, GPU-accelerated Text-to-Speech engine for research papers and PDFs.**  
> No cloud. No API keys. No listening fatigue. Powered by [Kokoro-82M](https://github.com/hexgrad/kokoro).

---

## ✨ Features

- 🔊 **Natural-sounding TTS** — Kokoro-82M rivals ElevenLabs at a fraction of the size
- ⚡ **GPU-accelerated** — Auto-detects NVIDIA CUDA, Apple MPS, or falls back to CPU
- 📄 **PDF Cleaning** — Strips citations, headers, page numbers before synthesis
- 🎛️ **10 voices** — American & British accents, male & female
- 🔌 **Chrome/Brave Extension** — Floating "Read" button, animated control bar, settings popup
- 🔒 **100% private** — Everything runs locally, nothing leaves your machine

---

## 🚀 Quick Start

### 1. Start the Server (Mac)
```bash
cd server
./start_server.sh
```

### 2. Load the Extension
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

### 3. Read Something
- **Select any text** on any page → click the floating **🔊 Read** button
- Or click the **Kokoro Reader** icon in your toolbar

---

## 📁 Project Structure

```
ReaderExtension/
├── docs/
│   └── KOKORO_TTS_GUIDE.md   ← Full setup guide
├── server/
│   ├── server.py             ← FastAPI TTS + PDF server
│   ├── requirements.txt
│   ├── start_server.sh       ← Mac launcher
│   └── start_server.bat      ← Windows launcher
└── extension/
    ├── manifest.json         ← MV3 manifest
    ├── background.js         ← Service worker
    ├── content.js            ← Floating read button
    ├── offscreen.{html,js}   ← Audio playback
    └── popup/                ← Extension popup UI
```

## 📖 Full Documentation

See **[docs/KOKORO_TTS_GUIDE.md](docs/KOKORO_TTS_GUIDE.md)** for:
- Hardware requirements & GPU setup
- All API endpoints
- Voice catalog
- PDF cleaning pipeline
- Troubleshooting

---

## API

The server exposes an **OpenAI-compatible** TTS API at `http://localhost:8880`:

```bash
curl -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","voice":"af_heart","input":"Hello world","speed":1.0}' \
  --output speech.wav
```

Any app that supports OpenAI's TTS endpoint (e.g. "Read Aloud" extension) can point to `http://localhost:8880/v1` as a drop-in replacement.

---

*Made with ❤️ | Kokoro-82M · FastAPI · Chrome MV3*
