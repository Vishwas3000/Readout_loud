"""
Kokoro-82M Local TTS Server
OpenAI-compatible API on http://localhost:8880

Endpoints:
  GET  /health              — Health check + device info
  GET  /v1/voices           — List available voices
  POST /v1/audio/speech     — Synthesize speech (OpenAI format)
  POST /v1/clean-pdf        — Clean a PDF for TTS via Marker

Compatibility:
  kokoro 0.7.x  →  Python 3.10-3.12 (recommended)
  kokoro 0.9.x  →  Python 3.10-3.12 only (pip install fails on 3.13)
"""

import io
import os
import sys
import logging
import time
from contextlib import asynccontextmanager
from typing import Literal, Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("kokoro-server")

# ─── Python version guard ──────────────────────────────────────────────────────
_py = sys.version_info
if _py.major == 3 and _py.minor >= 13:
    log.warning(
        f"⚠️  Python {_py.major}.{_py.minor} detected. "
        "kokoro>=0.9 requires <3.13. Using kokoro 0.7.x. "
        "Run start_server.sh — it auto-selects Python 3.12."
    )

# ─── Device Detection ──────────────────────────────────────────────────────────

def detect_device() -> str:
    if torch.cuda.is_available():
        log.info(f"🟢 CUDA GPU detected: {torch.cuda.get_device_name(0)}")
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        log.info("🟢 Apple Metal (MPS) detected")
        return "mps"
    log.info("🟡 No GPU found — using CPU")
    return "cpu"

DEVICE = detect_device()

# ─── Voice Catalog ─────────────────────────────────────────────────────────────
# lang_code: a=American EN, b=British EN, h=Hindi (Indian EN), e=Spanish,
#            f=French, i=Italian, p=Portuguese, j=Japanese, z=Mandarin
# Note: h/e/f/i/p require espeak-ng  |  j requires misaki[ja]  |  z requires misaki[zh]

VOICES = {
    # ── American English (lang_code='a') ────────────────────────────────────
    "af_heart":   {"lang": "a", "gender": "F", "accent": "American English", "style": "Warm, natural ⭐"},
    "af_bella":   {"lang": "a", "gender": "F", "accent": "American English", "style": "Clear, professional"},
    "af_sarah":   {"lang": "a", "gender": "F", "accent": "American English", "style": "Friendly, energetic"},
    "af_nicole":  {"lang": "a", "gender": "F", "accent": "American English", "style": "Soft, calm"},
    "af_sky":     {"lang": "a", "gender": "F", "accent": "American English", "style": "Upbeat, bright"},
    "af_jessica": {"lang": "a", "gender": "F", "accent": "American English", "style": "Expressive, vivid"},
    "af_river":   {"lang": "a", "gender": "F", "accent": "American English", "style": "Smooth, flowing"},
    "am_adam":    {"lang": "a", "gender": "M", "accent": "American English", "style": "Authority, deep"},
    "am_michael": {"lang": "a", "gender": "M", "accent": "American English", "style": "Natural, relaxed"},
    "am_echo":    {"lang": "a", "gender": "M", "accent": "American English", "style": "Clear, neutral"},
    "am_eric":    {"lang": "a", "gender": "M", "accent": "American English", "style": "Warm, conversational"},
    "am_liam":    {"lang": "a", "gender": "M", "accent": "American English", "style": "Youthful, energetic"},
    "am_onyx":    {"lang": "a", "gender": "M", "accent": "American English", "style": "Rich, baritone"},
    "am_orion":   {"lang": "a", "gender": "M", "accent": "American English", "style": "Commanding, clear"},
    # ── British English (lang_code='b') ─────────────────────────────────────
    "bf_emma":    {"lang": "b", "gender": "F", "accent": "British English",  "style": "Formal, crisp"},
    "bf_alice":   {"lang": "b", "gender": "F", "accent": "British English",  "style": "Elegant, refined"},
    "bf_isabella":{"lang": "b", "gender": "F", "accent": "British English",  "style": "Warm, storytelling"},
    "bf_lily":    {"lang": "b", "gender": "F", "accent": "British English",  "style": "Soft, gentle"},
    "bm_george":  {"lang": "b", "gender": "M", "accent": "British English",  "style": "Classic, measured"},
    "bm_daniel":  {"lang": "b", "gender": "M", "accent": "British English",  "style": "Authoritative, clear"},
    "bm_fable":   {"lang": "b", "gender": "M", "accent": "British English",  "style": "Narrative, engaging"},
    "bm_lewis":   {"lang": "b", "gender": "M", "accent": "British English",  "style": "Conversational"},
    # ── Hindi / Indian English (lang_code='h') — requires espeak-ng ─────────
    "hf_alpha":   {"lang": "h", "gender": "F", "accent": "Indian English",  "style": "Clear, Indian accent"},
    "hf_beta":    {"lang": "h", "gender": "F", "accent": "Indian English",  "style": "Warm, Indian accent"},
    "hm_omega":   {"lang": "h", "gender": "M", "accent": "Indian English",  "style": "Deep, Indian accent"},
    "hm_psi":     {"lang": "h", "gender": "M", "accent": "Indian English",  "style": "Natural, Indian accent"},
}

# ─── Global Model State ────────────────────────────────────────────────────────
# We maintain ONE KModel shared across all KPipeline instances (saves 300MB RAM).
# Pipelines are loaded lazily the first time a voice from that lang_code is used.

_model = None          # shared KModel weights
_pipelines: dict = {}  # lang_code → KPipeline
_pipeline_lock = None  # will be set to asyncio.Lock in lifespan


def _lang_for_voice(voice_id: str) -> str:
    """Return lang_code for a voice id, e.g. 'hf_alpha' → 'h'."""
    return VOICES.get(voice_id, {}).get("lang", voice_id[0])


def get_pipeline(lang_code: str = "a"):
    """Return (or lazily initialise) the KPipeline for the given lang_code."""
    if lang_code not in _pipelines:
        if _model is None:
            raise HTTPException(503, "Model not loaded yet. Please wait and retry.")
        log.info(f"⏳ Loading pipeline for lang_code='{lang_code}'…")
        from kokoro import KPipeline
        try:
            pipe = KPipeline(lang_code=lang_code, model=_model, device=DEVICE)
        except TypeError:
            pipe = KPipeline(lang_code=lang_code, model=_model)
        _pipelines[lang_code] = pipe
        log.info(f"✅ Pipeline ready for lang_code='{lang_code}'")
    return _pipelines[lang_code]

# ─── App Lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    log.info("⏳ Loading Kokoro-82M model weights…")
    t0 = time.time()
    try:
        import kokoro as _kokoro_pkg
        _ver = getattr(_kokoro_pkg, '__version__', 'unknown')
        log.info(f"kokoro version: {_ver}")

        # Load shared model weights once
        from kokoro import KModel
        try:
            _model = KModel(repo_id='hexgrad/Kokoro-82M').to(DEVICE)
        except TypeError:
            _model = KModel(repo_id='hexgrad/Kokoro-82M')

        # Pre-warm the American English pipeline (most common)
        get_pipeline("a")
        log.info(f"✅ Model + English pipeline ready in {time.time()-t0:.1f}s on device={DEVICE}")
    except ImportError as e:
        log.error(f"❌ kokoro import failed: {e}. Run: pip install 'kokoro>=0.7.0,<0.9.0'")
    except Exception as e:
        log.error(f"❌ Failed to load model: {e}", exc_info=True)
    yield
    log.info("🛑 Server shutting down")

app = FastAPI(
    title="Kokoro TTS Server",
    description="Local Kokoro-82M TTS with OpenAI-compatible API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Audio Helpers ─────────────────────────────────────────────────────────────

def audio_to_wav_bytes(audio_array: np.ndarray, sample_rate: int = 24000) -> bytes:
    """Convert a numpy float32 audio array to WAV bytes."""
    buf = io.BytesIO()
    sf.write(buf, audio_array, sample_rate, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()

def audio_to_mp3_bytes(audio_array: np.ndarray, sample_rate: int = 24000) -> bytes:
    """Convert numpy audio to MP3 via soundfile (requires libsndfile with mp3 support).
    Falls back to WAV if MP3 encoding is unavailable."""
    try:
        buf = io.BytesIO()
        sf.write(buf, audio_array, sample_rate, format="MP3")
        buf.seek(0)
        return buf.read()
    except Exception:
        log.warning("MP3 encoding unavailable, falling back to WAV")
        return audio_to_wav_bytes(audio_array, sample_rate)

def _extract_audio(obj) -> np.ndarray | None:
    """Recursively extract and concatenate audio from any kokoro output structure.

    kokoro 0.8.4 yields (graphemes, phonemes, audio) tuples where audio may be:
      - a 1D numpy float32 array (0.7.x style)
      - a PyTorch tensor on MPS/CUDA (0.8.x style)
      - a LIST of tensors/arrays (one per phoneme group in 0.8.4)

    Strings and other non-audio objects are silently skipped.
    """
    if obj is None:
        return None

    # ── PyTorch tensor (MPS, CUDA, CPU) ──────────────────────────────────────
    if hasattr(obj, "detach"):
        arr = obj.detach().cpu().numpy()
        if arr.ndim == 2 and arr.shape[0] == 1:
            arr = arr.squeeze(0)
        return arr.astype(np.float32) if arr.ndim == 1 and len(arr) > 0 else None

    # ── NumPy array ───────────────────────────────────────────────────────────
    if isinstance(obj, np.ndarray):
        if obj.ndim == 2 and obj.shape[0] == 1:
            obj = obj.squeeze(0)
        return obj.astype(np.float32) if obj.ndim == 1 and len(obj) > 0 else None

    # ── Skip scalars and text ─────────────────────────────────────────────────
    if isinstance(obj, (str, bytes, int, float, bool)):
        return None

    # ── Container (list / tuple / namedtuple / custom sequence) ──────────────
    if hasattr(obj, "__len__") and hasattr(obj, "__iter__"):
        # Optimistic path: if obj[2] is directly audio, use it
        try:
            candidate = obj[2]
            if hasattr(candidate, "detach") or isinstance(candidate, np.ndarray):
                return _extract_audio(candidate)
        except (IndexError, TypeError, KeyError):
            pass

        # General path: collect audio from every sub-item recursively
        sub_chunks = []
        for item in obj:
            arr = _extract_audio(item)
            if arr is not None:
                sub_chunks.append(arr)
        return np.concatenate(sub_chunks) if sub_chunks else None

    return None


def synthesize(text: str, voice: str, speed: float) -> np.ndarray:
    """Run Kokoro TTS synthesis, returns concatenated float32 numpy array.
    Compatible with kokoro 0.7.x / 0.8.x on CPU, MPS, and CUDA.
    Routes to the correct language pipeline automatically.
    """
    lang_code = _lang_for_voice(voice)
    pipeline = get_pipeline(lang_code)
    chunks = []

    # split_pattern supported in 0.7.x+
    try:
        generator = pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+")
    except TypeError:
        generator = pipeline(text, voice=voice, speed=speed)

    for i, result in enumerate(generator):
        # Log the first result's shape for diagnostics
        if i == 0:
            try:
                r2_type = type(result[2]).__name__ if hasattr(result, "__len__") and len(result) >= 3 else "N/A"
                log.info(
                    f"[kokoro] result type={type(result).__name__} "
                    f"is_tuple={isinstance(result, tuple)} "
                    f"result[2] type={r2_type}"
                )
            except Exception:
                pass

        arr = _extract_audio(result)
        if arr is not None:
            chunks.append(arr)

    if not chunks:
        raise HTTPException(422, "Synthesis produced no audio. Check your input text.")
    return np.concatenate(chunks)



# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    model_ready = _model is not None and bool(_pipelines)
    return {
        "status": "ok" if model_ready else "loading",
        "device": DEVICE,
        "model_loaded": model_ready,
        "pipelines_loaded": list(_pipelines.keys()),
        "cuda_available": torch.cuda.is_available(),
        "mps_available": hasattr(torch.backends, "mps") and torch.backends.mps.is_available(),
    }

@app.get("/v1/voices")
async def list_voices():
    return {
        "voices": [
            {"id": vid, **meta} for vid, meta in VOICES.items()
        ]
    }

# ─── OpenAI-Compatible TTS Endpoint ───────────────────────────────────────────

class SpeechRequest(BaseModel):
    model: str = "kokoro"
    voice: str = Field(default="af_heart", description="Voice ID from /v1/voices")
    input: str = Field(..., description="Text to synthesize (max 5000 chars)")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    response_format: Literal["wav", "mp3"] = "wav"

@app.post("/v1/audio/speech")
async def text_to_speech(req: SpeechRequest):
    if not req.input.strip():
        raise HTTPException(422, "Input text is empty")
    if len(req.input) > 5000:
        raise HTTPException(422, "Input text exceeds 5000 characters. Split into chunks.")
    if req.voice not in VOICES:
        raise HTTPException(422, f"Unknown voice '{req.voice}'. Call GET /v1/voices for options.")

    log.info(f"Synthesizing {len(req.input)} chars | voice={req.voice} speed={req.speed}")
    t0 = time.time()

    try:
        audio = synthesize(req.input, req.voice, req.speed)
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Synthesis error")
        raise HTTPException(500, f"Synthesis failed: {str(e)}")

    duration = len(audio) / 24000
    elapsed = time.time() - t0
    log.info(f"✅ Done: {duration:.1f}s audio in {elapsed:.2f}s ({duration/elapsed:.1f}× real-time)")

    if req.response_format == "mp3":
        audio_bytes = audio_to_mp3_bytes(audio)
        media_type = "audio/mpeg"
    else:
        audio_bytes = audio_to_wav_bytes(audio)
        media_type = "audio/wav"

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={
            "X-Audio-Duration": str(round(duration, 2)),
            "X-Processing-Time": str(round(elapsed, 2)),
            "X-Device": DEVICE,
        },
    )

# ─── Streaming TTS (chunked for long texts) ────────────────────────────────────

@app.post("/v1/audio/speech/stream")
async def text_to_speech_stream(req: SpeechRequest):
    """Stream audio chunks as they are synthesized — ideal for long texts."""
    if not req.input.strip():
        raise HTTPException(422, "Input text is empty")
    if req.voice not in VOICES:
        raise HTTPException(422, f"Unknown voice '{req.voice}'.")

    pipeline = get_pipeline()

    async def audio_generator():
        try:
            generator = pipeline(req.input, voice=req.voice, speed=req.speed, split_pattern=r"[.!?]+")
        except TypeError:
            generator = pipeline(req.input, voice=req.voice, speed=req.speed)

        for result in generator:
            arr = _extract_audio(result)
            if arr is not None:
                yield audio_to_wav_bytes(arr)

    return StreamingResponse(
        audio_generator(),
        media_type="audio/wav",
        headers={"X-Device": DEVICE},
    )

# ─── PDF Cleaning Endpoint ─────────────────────────────────────────────────────

@app.post("/v1/clean-pdf")
async def clean_pdf(
    file: UploadFile = File(...),
    clean_citations: bool = True,
    remove_equations: bool = True,
):
    """
    Accept a PDF and return cleaned plain text suitable for TTS.
    Uses marker-pdf to strip headers, footers, citations, equations.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(422, "Only PDF files are supported")

    try:
        from marker.convert import convert_single_pdf
        from marker.models import load_all_models
    except ImportError:
        raise HTTPException(503, "marker-pdf not installed. Run: pip install marker-pdf")

    # Save upload to temp file
    import tempfile
    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        log.info(f"Cleaning PDF: {file.filename} ({len(content)/1024:.0f} KB)")
        t0 = time.time()

        models = load_all_models()
        full_text, images, metadata = convert_single_pdf(tmp_path, models)

        # Post-processing for TTS
        cleaned = _clean_for_tts(full_text, clean_citations, remove_equations)

        elapsed = time.time() - t0
        log.info(f"✅ PDF cleaned in {elapsed:.1f}s | {len(cleaned)} chars")

        return {
            "filename": file.filename,
            "text": cleaned,
            "char_count": len(cleaned),
            "pages": metadata.get("pages", 0),
            "processing_time": round(elapsed, 2),
            "cleaned": True,
        }
    finally:
        os.unlink(tmp_path)

def _clean_for_tts(text: str, clean_citations: bool, remove_equations: bool) -> str:
    """Post-process Marker output for TTS readability."""
    import re

    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()

        # Skip page numbers (standalone digits)
        if re.fullmatch(r"\d{1,4}", stripped):
            continue

        # Skip short header/footer artifacts
        if len(stripped) < 4 and stripped not in (".", ","):
            continue

        # Remove inline citations like (Smith, 2017) or [1] or [Smith17]
        if clean_citations:
            stripped = re.sub(r"\([A-Z][a-z]+(?:\s+et\s+al\.?)?,?\s*\d{4}[a-z]?\)", "", stripped)
            stripped = re.sub(r"\[\d+(?:,\s*\d+)*\]", "", stripped)
            stripped = re.sub(r"\[[A-Za-z]+\d{2,4}\]", "", stripped)

        # Remove or skip equation blocks (lines that are mostly symbols)
        if remove_equations:
            symbol_ratio = sum(1 for c in stripped if not c.isalpha() and not c.isspace()) / max(len(stripped), 1)
            if symbol_ratio > 0.6 and len(stripped) > 5:
                continue

        # Fix hyphenated line breaks (word-\nbreak → wordbreak)
        if stripped.endswith("-") and len(stripped) > 1:
            stripped = stripped[:-1]

        # Collapse multiple spaces
        stripped = re.sub(r"\s+", " ", stripped).strip()

        if stripped:
            cleaned_lines.append(stripped)

    return "\n".join(cleaned_lines)

# ─── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8880,
        reload=False,
        log_level="info",
    )
