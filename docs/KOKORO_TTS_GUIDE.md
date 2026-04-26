# 🎙️ Kokoro-82M Local TTS Pipeline — Complete Guide

> A local, GPU-accelerated Text-to-Speech pipeline for reading research papers and PDFs — no cloud, no API keys, no listening fatigue.

---

## Table of Contents

1. [Why Kokoro-82M?](#why-kokoro-82m)
2. [System Requirements](#system-requirements)
3. [Architecture Overview](#architecture-overview)
4. [Backend Server Setup](#backend-server-setup)
   - [Mac (Apple Silicon / Intel)](#mac-apple-silicon--intel)
   - [Windows (CUDA / CPU)](#windows-cuda--cpu)
5. [Chrome/Brave Extension Setup](#chromebrave-extension-setup)
6. [API Reference](#api-reference)
7. [Voice Catalog](#voice-catalog)
8. [PDF Cleaning Pipeline](#pdf-cleaning-pipeline)
9. [Troubleshooting](#troubleshooting)
10. [Pro-Tips for Research Papers](#pro-tips-for-research-papers)

---

## Why Kokoro-82M?

| Feature | Kokoro-82M | Piper | ElevenLabs API |
|:--------|:-----------|:------|:---------------|
| **Model Size** | ~82M params (~300MB) | ~50MB | Cloud |
| **Quality** | ⭐⭐⭐⭐⭐ Human-like | ⭐⭐⭐ Clear | ⭐⭐⭐⭐⭐ |
| **CPU Performance** | Faster than real-time | Near-instant | Network-dependent |
| **GPU Performance** | 10–50× real-time | N/A | Cloud |
| **Privacy** | 100% local | 100% local | Data sent to cloud |
| **Cost** | Free | Free | $0.15–$1.00 / 1k chars |
| **Voices** | 60+ (multi-accent) | 100+ (different models) | 30+ |
| **Best For** | Long-form papers | Notifications | Creative audio |

**Kokoro-82M** is the sweet spot: small enough to fit in RAM on any modern laptop, fast enough to pre-cache a 10-page paper in under 10 seconds, and natural enough for hours of listening without fatigue.

---

## System Requirements

### Minimum (CPU-only)
- **CPU:** Any modern x86-64 or ARM64 (Apple M1+)
- **RAM:** 4 GB free
- **Storage:** 2 GB for models + dependencies
- **Python:** 3.10 or newer

### Recommended (GPU-accelerated)
- **GPU:** NVIDIA (CUDA 11.8+) or Apple Silicon (MPS via Metal)
- **VRAM:** 2 GB+ (Kokoro-82M itself is only ~300MB)
- **RAM:** 8 GB
- The server auto-detects: **CUDA → MPS → CPU**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Chrome / Brave Browser              │
│                                                      │
│  ┌──────────────┐    ┌────────────┐   ┌──────────┐  │
│  │ Content Script│───▶│Background  │──▶│ Offscreen│  │
│  │ (text select) │    │  Worker    │   │ (audio)  │  │
│  └──────────────┘    └────────────┘   └──────────┘  │
│                            │                         │
└────────────────────────────┼────────────────────────┘
                             │ HTTP POST
                             ▼
┌─────────────────────────────────────────────────────┐
│          Local Server  (localhost:8880)              │
│                                                      │
│  ┌──────────────┐    ┌────────────┐                 │
│  │   FastAPI    │───▶│  Kokoro-   │──▶  PCM Audio   │
│  │  /v1/audio/  │    │   82M      │    (WAV/MP3)    │
│  │   speech     │    │ (GPU/CPU)  │                 │
│  └──────────────┘    └────────────┘                 │
│                                                      │
│  ┌──────────────┐    ┌────────────┐                 │
│  │   FastAPI    │───▶│  marker-   │──▶  Clean Text  │
│  │ /v1/clean-   │    │   pdf      │                 │
│  │    pdf       │    │            │                 │
│  └──────────────┘    └────────────┘                 │
└─────────────────────────────────────────────────────┘
```

**Flow for reading a research paper:**
1. Open PDF in Chrome tab
2. Select text (or use "Read Full Page" in popup)
3. Extension sends text → Background Worker → local server
4. Server (optionally) cleans the text via Marker
5. Kokoro synthesizes audio (GPU-accelerated if available)
6. Offscreen document plays the audio blob
7. Floating controls let you pause/resume/stop

---

## Backend Server Setup

### Mac (Apple Silicon / Intel)

**Step 1: Clone and navigate**
```bash
cd ReaderExtension/server
```

**Step 2: Create virtual environment**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Step 3: Install dependencies**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> **Apple Silicon note:** PyTorch will use **MPS (Metal Performance Shaders)** automatically for GPU acceleration. No extra steps needed.

**Step 4: Start the server**
```bash
./start_server.sh
```

The server will be running at `http://localhost:8880`.

**First-run model download:** Kokoro-82M (~300MB) and its voice pack will be downloaded automatically on first startup. This only happens once.

---

### Windows (CUDA / CPU)

**Step 1: Install Python 3.10+** from [python.org](https://python.org)

**Step 2: Open PowerShell in the `server/` directory**
```powershell
python -m venv .venv
.\.venv\Scripts\activate
```

**Step 3: Install PyTorch with CUDA** (skip for CPU-only)
```powershell
# For CUDA 12.x (NVIDIA GPU)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# For CPU-only
pip install torch torchvision torchaudio
```

**Step 4: Install remaining dependencies**
```powershell
pip install -r requirements.txt
```

**Step 5: Start the server**
```powershell
.\start_server.bat
```

---

## Chrome/Brave Extension Setup

**Step 1:** Open Chrome/Brave and navigate to `chrome://extensions`

**Step 2:** Enable **"Developer mode"** (toggle in top-right corner)

**Step 3:** Click **"Load unpacked"** and select the `extension/` directory

**Step 4:** The 🔊 Kokoro Reader icon will appear in your toolbar

**Step 5:** Click the icon → Settings → ensure Server URL is `http://localhost:8880`

---

## API Reference

The server exposes an **OpenAI-compatible TTS API**, so any tool that supports OpenAI TTS will work with zero changes.

### `POST /v1/audio/speech`
Synthesize speech from text.

**Request:**
```json
{
  "model": "kokoro",
  "voice": "af_heart",
  "input": "The quick brown fox jumps over the lazy dog.",
  "speed": 1.0,
  "response_format": "wav"
}
```

**Response:** Binary audio file (WAV or MP3)

**Parameters:**
| Parameter | Type | Default | Description |
|:----------|:-----|:--------|:------------|
| `model` | string | `"kokoro"` | Always `"kokoro"` |
| `voice` | string | `"af_heart"` | See Voice Catalog below |
| `input` | string | — | Text to synthesize (max 5000 chars) |
| `speed` | float | `1.0` | Playback speed (0.5–2.0) |
| `response_format` | string | `"wav"` | `"wav"` or `"mp3"` |

---

### `GET /v1/voices`
List all available voices.

```bash
curl http://localhost:8880/v1/voices
```

---

### `POST /v1/clean-pdf`
Clean a PDF file for TTS (removes headers, footers, citations, page numbers).

```bash
curl -X POST http://localhost:8880/v1/clean-pdf \
  -F "file=@paper.pdf" \
  -o cleaned_text.json
```

**Response:**
```json
{
  "title": "Attention Is All You Need",
  "text": "...",
  "pages": 15,
  "cleaned": true
}
```

---

### `GET /health`
Server health check.

```bash
curl http://localhost:8880/health
# {"status": "ok", "device": "mps", "model_loaded": true}
```

---

## Voice Catalog

| Voice ID | Gender | Accent | Style |
|:---------|:-------|:-------|:------|
| `af_heart` | Female | American | Warm, natural (⭐ recommended) |
| `af_bella` | Female | American | Clear, professional |
| `af_sarah` | Female | American | Friendly, energetic |
| `af_nicole` | Female | American | Soft, calm |
| `am_adam` | Male | American | Authority, deep |
| `am_michael` | Male | American | Natural, relaxed |
| `bf_emma` | Female | British | Formal, crisp |
| `bm_george` | Male | British | Classic, measured |
| `bm_lewis` | Male | British | Conversational |

> **Best for research papers:** `af_heart` or `bf_emma` — clear articulation, professional tone, great for technical content.

---

## PDF Cleaning Pipeline

Raw PDF text fed directly into TTS produces painful results:
> *"...the attention mechanism Smith comma 2017 has been shown... open paren Figure 3 close paren page 7 of 15..."*

The `/v1/clean-pdf` endpoint uses **[Marker](https://github.com/VikParuchuri/marker)** to:
- ✅ Remove page headers and footers
- ✅ Strip citation markers `(Smith, 2017)` → removed or converted to spoken form
- ✅ Remove figure/table captions from inline flow
- ✅ Fix hyphenation artifacts (e.g., `atten-\ntion` → `attention`)
- ✅ Detect and skip mathematical equations
- ✅ Preserve paragraph structure for natural pauses

> **Pro-tip:** Use the extension's "Clean & Read PDF" button for the best experience with academic papers. This sends the page content through the cleaning pipeline first.

---

## Troubleshooting

### Server won't start
```bash
# Check if port 8880 is already in use
lsof -i :8880
# Kill the occupying process
kill -9 <PID>
```

### "Connection refused" in extension
- Ensure the server is running (`./start_server.sh`)  
- Check the popup settings — Server URL should be `http://localhost:8880`
- Check CORS: the server allows all origins by default for localhost

### Audio is choppy or slow
- First synthesis is always slower (model warm-up caches phoneme lookups)
- Check your device: `curl http://localhost:8880/health` — if `"device": "cpu"`, consider GPU setup
- Reduce `speed` to 0.9 and `response_format` to `"wav"` (less encoding overhead)

### PDF cleaning is slow
- Marker downloads its own models (~200MB) on first run
- Subsequent PDF cleanings are much faster (models cached)
- For CPU-only machines, expect ~2–5 seconds per page

### Apple Silicon "MPS not available"
```bash
pip install --upgrade torch torchvision torchaudio
```

---

## Pro-Tips for Research Papers

1. **Never read the abstract first.** Use the extension's "Read Section" feature to jump to the Introduction → Methods → Results flow.

2. **Speed ramping.** Start at 0.9× for dense math sections, switch to 1.2× for related-work sections via the popup speed slider.

3. **Background reading.** Minimize the browser — the audio continues playing via the offscreen document even when the tab is hidden.

4. **Paragraph-by-paragraph.** Instead of selecting an entire paper, select one paragraph at a time. The pre-caching makes the transition seamless.

5. **Citation mode.** The server has a `clean_citations` flag in the PDF cleaner. Enable it to convert `(Vaswani et al., 2017)` to natural spoken phrases like "as cited in the literature."

---

*Built with ❤️ using Kokoro-82M, FastAPI, and Chrome Extension MV3.*
