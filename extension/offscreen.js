/**
 * Kokoro Reader — Offscreen Document
 *
 * Runs in a hidden page to handle audio playback.
 * Chrome MV3 service workers cannot play audio directly — this is the workaround.
 *
 * Messages received from background.js:
 *   { target: "offscreen", action: "play-audio",   audioBytes: number[], format: "wav"|"mp3", chunkIndex: number }
 *   { target: "offscreen", action: "stop-audio" }
 *   { target: "offscreen", action: "pause-audio" }
 *   { target: "offscreen", action: "resume-audio" }
 */

let currentAudio = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  const handle = async () => {
    switch (message.action) {
      case "play-audio": {
        // Stop any currently playing audio
        stopCurrentAudio();

        // Convert byte array to Blob → Object URL
        const uint8 = new Uint8Array(message.audioBytes);
        const mimeType = message.format === "mp3" ? "audio/mpeg" : "audio/wav";
        const blob = new Blob([uint8], { type: mimeType });
        const url = URL.createObjectURL(blob);

        currentAudio = new Audio(url);
        currentAudio.volume = 1.0;

        currentAudio.addEventListener("ended", () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          // Notify background that this chunk finished → play next
          chrome.runtime.sendMessage({ action: "chunk-done", chunkIndex: message.chunkIndex });
        });

        currentAudio.addEventListener("error", (e) => {
          console.error("[offscreen] Audio error:", e);
          URL.revokeObjectURL(url);
          currentAudio = null;
          chrome.runtime.sendMessage({
            action: "chunk-done",
            chunkIndex: message.chunkIndex,
            error: "Audio playback failed",
          });
        });

        await currentAudio.play();
        return { ok: true };
      }

      case "stop-audio":
        stopCurrentAudio();
        return { ok: true };

      case "pause-audio":
        if (currentAudio && !currentAudio.paused) {
          currentAudio.pause();
        }
        return { ok: true };

      case "resume-audio":
        if (currentAudio && currentAudio.paused) {
          await currentAudio.play();
        }
        return { ok: true };

      default:
        return { error: `Unknown offscreen action: ${message.action}` };
    }
  };

  handle().then(sendResponse).catch((err) => {
    console.error("[offscreen] Error:", err);
    sendResponse({ error: err.message });
  });

  return true; // async
});

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}
