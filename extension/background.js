/**
 * Kokoro Reader — Background Service Worker (MV3)
 *
 * Responsibilities:
 *  - Handle messages from content script and popup
 *  - Call local Kokoro TTS server
 *  - Manage offscreen document for audio playback
 *  - Track playback state across tabs
 *  - Context menu integration
 */

// ─── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  serverUrl: "http://localhost:8880",
  voice: "af_heart",
  speed: 1.0,
  responseFormat: "wav",
  autoCleanCitations: true,
  chunkSize: 2000, // characters per synthesis chunk
};

// ─── State ────────────────────────────────────────────────────────────────────
let playbackState = {
  isPlaying: false,
  isPaused: false,
  currentText: "",
  currentChunkIndex: 0,
  chunks: [],
  tabId: null,
};

// ─── Settings Helpers ─────────────────────────────────────────────────────────
async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

// ─── Offscreen Document ───────────────────────────────────────────────────────
let offscreenCreated = false;

async function ensureOffscreen() {
  if (offscreenCreated) return;
  const existing = await chrome.offscreen.getContexts?.({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  }).catch(() => []);
  if (existing && existing.length > 0) {
    offscreenCreated = true;
    return;
  }
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen.html"),
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Playing synthesized speech audio from local Kokoro TTS server",
  });
  offscreenCreated = true;
}

async function sendToOffscreen(message) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", ...message });
}

// ─── Text Chunking ────────────────────────────────────────────────────────────
function chunkText(text, maxLength) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

// ─── TTS Synthesis ────────────────────────────────────────────────────────────
async function synthesizeChunk(text, settings) {
  const url = `${settings.serverUrl}/v1/audio/speech`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      voice: settings.voice,
      input: text,
      speed: settings.speed,
      response_format: settings.responseFormat,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`TTS server error ${response.status}: ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Array.from(new Uint8Array(arrayBuffer));
}

// ─── Playback Pipeline ────────────────────────────────────────────────────────
async function startSpeaking(text, tabId) {
  const settings = await getSettings();

  // Stop any current playback
  await stopSpeaking();

  playbackState = {
    isPlaying: true,
    isPaused: false,
    currentText: text,
    chunks: chunkText(text, settings.chunkSize),
    currentChunkIndex: 0,
    tabId,
  };

  broadcastState();
  await playNextChunk(settings);
}

async function playNextChunk(settings) {
  if (!playbackState.isPlaying || playbackState.isPaused) return;
  if (playbackState.currentChunkIndex >= playbackState.chunks.length) {
    // Done
    playbackState.isPlaying = false;
    broadcastState();
    return;
  }

  const chunk = playbackState.chunks[playbackState.currentChunkIndex];
  const chunkNum = playbackState.currentChunkIndex + 1;
  const total = playbackState.chunks.length;

  try {
    broadcastState({ status: `Synthesizing chunk ${chunkNum}/${total}...` });
    const audioBytes = await synthesizeChunk(chunk, settings);
    if (!playbackState.isPlaying || playbackState.isPaused) return; // aborted during synthesis

    await sendToOffscreen({
      action: "play-audio",
      audioBytes,
      format: settings.responseFormat,
      chunkIndex: playbackState.currentChunkIndex,
    });
  } catch (err) {
    console.error("[kokoro] Synthesis error:", err);
    broadcastState({ error: err.message });
    playbackState.isPlaying = false;
  }
}

async function stopSpeaking() {
  playbackState.isPlaying = false;
  playbackState.isPaused = false;
  playbackState.chunks = [];
  playbackState.currentChunkIndex = 0;
  try {
    await sendToOffscreen({ action: "stop-audio" });
  } catch (_) {}
  broadcastState();
}

async function togglePause() {
  if (!playbackState.isPlaying) return;
  playbackState.isPaused = !playbackState.isPaused;
  await sendToOffscreen({ action: playbackState.isPaused ? "pause-audio" : "resume-audio" });
  broadcastState();
}

function broadcastState(extra = {}) {
  const state = {
    isPlaying: playbackState.isPlaying,
    isPaused: playbackState.isPaused,
    chunkIndex: playbackState.currentChunkIndex,
    totalChunks: playbackState.chunks.length,
    ...extra,
  };
  // Notify popup
  chrome.runtime.sendMessage({ action: "state-update", state }).catch(() => {});
  // Notify content script
  if (playbackState.tabId) {
    chrome.tabs.sendMessage(playbackState.tabId, { action: "state-update", state }).catch(() => {});
  }
}

// ─── Server Health Check ──────────────────────────────────────────────────────
async function checkServerHealth(serverUrl) {
  try {
    const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: "Server not reachable. Is it running?" };
  }
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "kokoro-read-selection",
    title: "🔊 Read with Kokoro",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "kokoro-stop",
    title: "⏹ Stop Reading",
    contexts: ["all"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "kokoro-read-selection" && info.selectionText) {
    await startSpeaking(info.selectionText.trim(), tab.id);
  } else if (info.menuItemId === "kokoro-stop") {
    await stopSpeaking();
  }
});

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") return; // ignore offscreen-targeted messages

  const handle = async () => {
    switch (message.action) {
      case "speak":
        await startSpeaking(message.text, sender.tab?.id || message.tabId);
        return { ok: true };

      case "stop":
        await stopSpeaking();
        return { ok: true };

      case "toggle-pause":
        await togglePause();
        return { ok: true };

      case "get-state":
        return {
          isPlaying: playbackState.isPlaying,
          isPaused: playbackState.isPaused,
          chunkIndex: playbackState.currentChunkIndex,
          totalChunks: playbackState.chunks.length,
        };

      case "get-settings":
        return await getSettings();

      case "save-settings":
        await chrome.storage.sync.set(message.settings);
        return { ok: true };

      case "health-check": {
        const settings = await getSettings();
        return await checkServerHealth(message.serverUrl || settings.serverUrl);
      }

      case "chunk-done":
        // Offscreen document finished playing a chunk
        playbackState.currentChunkIndex++;
        const settings = await getSettings();
        await playNextChunk(settings);
        return { ok: true };

      default:
        return { error: `Unknown action: ${message.action}` };
    }
  };

  handle().then(sendResponse).catch((err) => {
    console.error("[kokoro] Handler error:", err);
    sendResponse({ error: err.message });
  });

  return true; // keep channel open for async
});
