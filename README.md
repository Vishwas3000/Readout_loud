<div align="center">
  <img src="extension/icons/icon128.png" width="96" alt="Kokoro Reader" />
  <h1>Kokoro Reader</h1>
  <p><strong>Local AI text-to-speech for research papers & webpages.</strong><br/>
  Powered by <a href="https://huggingface.co/hexgrad/Kokoro-82M">Kokoro-82M</a> · 100% private · No cloud · No API keys.</p>

  <p>
    <img src="https://img.shields.io/badge/model-Kokoro--82M-6366f1?style=flat-square" />
    <img src="https://img.shields.io/badge/python-3.12-06b6d4?style=flat-square" />
    <img src="https://img.shields.io/badge/manifest-v3-10b981?style=flat-square" />
    <img src="https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square" />
  </p>
</div>

---

## What is this?

Kokoro Reader is a Chrome extension that reads any selected text or full webpage aloud using a **local** AI voice model — no internet connection, no API keys, no data uploaded anywhere. Text stays on your machine.

It's designed for reading research papers, documentation, and long articles without fatigue.

**Voices available:**
| Accent | Options |
|:-------|:--------|
| 🇮🇳 Indian English | hf_alpha, hf_beta, hm_omega, hm_psi |
| 🇺🇸 American English | af_heart ⭐, af_bella, af_sarah, af_nicole, af_sky, af_jessica, af_river, am_adam, am_michael, am_echo, am_eric, am_liam, am_onyx, am_orion |
| 🇬🇧 British English | bf_emma, bf_alice, bf_isabella, bf_lily, bm_george, bm_daniel, bm_fable, bm_lewis |

---

## Requirements

| Component | Version |
|:----------|:--------|
| Python | **3.12** (not 3.13) |
| espeak-ng | any (for Indian/European voices) |
| Chrome / Chromium | 116+ |
| RAM | ≥ 4 GB |
| GPU | Optional — works on CPU, Apple MPS, NVIDIA CUDA |

---

## Quick Start (Mac)

### 1. Install dependencies

```bash
# Install espeak-ng (needed for Indian & European voices)
brew install espeak-ng

# Confirm Python 3.12 is available
python3.12 --version
# If missing: brew install python@3.12
```

### 2. Clone & start the server

```bash
git clone https://github.com/Vishwas3000/Readout_loud.git
cd Readout_loud/server
chmod +x start_server.sh
./start_server.sh
```

The first run downloads the Kokoro-82M model (~330MB) and sets up a virtual environment. Subsequent starts take ~3 seconds.

You should see:
```
✅ Model + English pipeline ready in 4.2s on device=mps
INFO:     Uvicorn running on http://0.0.0.0:8880
```

### 3. Load the extension in Chrome

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

The Kokoro Reader icon will appear in your toolbar.

---

## Quick Start (Windows)

```batch
# 1. Install Python 3.12 from python.org (check "Add to PATH")
# 2. Install espeak-ng: https://github.com/espeak-ng/espeak-ng/releases
# 3. Open Command Prompt in the repo folder:

cd server
start_server.bat
```

---

## Usage

### Reading selected text
1. Select any text on a webpage
2. Click the **Read** button that appears, or right-click → **Read with Kokoro**

### Reading the full page
1. Click the Kokoro Reader toolbar icon
2. Click **Read Full Page**

### Changing voice / speed
1. Click the toolbar icon → **Voice** tab
2. Select a voice from the dropdown — it saves automatically
3. Use the **Speed** tab to adjust playback rate (0.5× to 2×)

### Keyboard shortcuts *(configurable in chrome://extensions/shortcuts)*
| Action | Default |
|:-------|:--------|
| Read selection | — |
| Stop | — |

---

## Project Structure

```
Readout_loud/
├── extension/           # Chrome Extension (Manifest V3)
│   ├── background.js    # Service worker — TTS orchestration
│   ├── content.js       # Injected script — floating read button
│   ├── offscreen.js     # Audio playback (MV3 offscreen API)
│   ├── manifest.json
│   ├── icons/           # 16, 48, 128px icons
│   ├── popup/
│   │   ├── popup.html   # Extension popup UI (Tailwind)
│   │   ├── popup.js
│   │   └── popup.css    # Compiled Tailwind output
│   └── src/
│       └── input.css    # Tailwind source (run npm run build:css to recompile)
│
├── server/              # Local Python TTS server
│   ├── server.py        # FastAPI server — Kokoro-82M inference
│   ├── requirements.txt
│   ├── start_server.sh  # Mac/Linux launcher
│   └── start_server.bat # Windows launcher
│
└── docs/
    ├── KOKORO_TTS_GUIDE.md
    └── privacy-policy.html
```

---

## Server API

The server exposes an **OpenAI-compatible** TTS endpoint, so any OpenAI TTS client works with it.

```bash
# Synthesize speech
POST http://localhost:8880/v1/audio/speech
{
  "model": "kokoro",
  "voice": "hf_alpha",
  "input": "Hello from Kokoro Reader",
  "speed": 1.0,
  "response_format": "wav"
}

# List voices
GET http://localhost:8880/v1/voices

# Health check
GET http://localhost:8880/health
```

---

## Rebuilding the Tailwind CSS

If you modify `popup.html` or `popup.js` and need to update styles:

```bash
cd extension
npm install
npm run build:css
```

---

## Troubleshooting

### Server won't start
```
ERROR: Could not find a version that satisfies the requirement kokoro>=0.9.4
```
→ You're using Python 3.13. Kokoro 0.8.x requires Python 3.12.
```bash
brew install python@3.12
# Then re-run ./start_server.sh — it auto-detects python3.12
```

### Indian/European voices sound wrong or use wrong accent
→ `espeak-ng` is not installed. Run:
```bash
brew install espeak-ng   # Mac
apt install espeak-ng    # Linux
# Windows: download from https://github.com/espeak-ng/espeak-ng/releases
```

### Extension shows "Server unreachable"
1. Check the server is running: `curl http://localhost:8880/health`
2. Make sure port 8880 is not blocked by firewall
3. Try reloading the extension at `chrome://extensions`

### Audio is slow to start
The first synthesis of a new voice (~2–4s) downloads the voice embedding from HuggingFace. Cached after first use.

---

## Performance

Tested on MacBook Pro M3 (Apple MPS):

| Text length | Synthesis time | Audio duration | Speed |
|:------------|:---------------|:---------------|:------|
| 1 sentence | ~0.8s | ~4s | 5× real-time |
| 1 paragraph | ~2.5s | ~30s | 12× real-time |
| Full page (~2000 chars) | ~5s | ~90s | 18× real-time |

---

## Privacy

**No data ever leaves your machine.**

- Text is sent only to `localhost:8880` (your own computer)
- No analytics, no telemetry, no cloud APIs
- Model weights stored locally in `~/.cache/huggingface/`

[Full Privacy Policy](https://vishwas3000.github.io/Readout_loud/docs/privacy-policy.html)

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Built with <a href="https://huggingface.co/hexgrad/Kokoro-82M">Kokoro-82M</a> · <a href="https://fastapi.tiangolo.com">FastAPI</a> · Chrome MV3</sub>
</div>
