/**
 * Kokoro Reader — Content Script
 *
 * Runs on every page. Responsibilities:
 *  - Detect text selection via mouseup
 *  - Show a floating "🔊 Read" button near selection
 *  - Show a floating control bar during playback (pause/stop/progress)
 *  - Receive state updates from background worker
 */

(function () {
  "use strict";

  if (window.__kokoroInjected) return;
  window.__kokoroInjected = true;

  // ─── Floating Read Button ──────────────────────────────────────────────────
  let readBtn = null;
  let controlBar = null;
  let selectionTimeout = null;

  function createReadButton() {
    const btn = document.createElement("div");
    btn.id = "kokoro-read-btn";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Read
    `;
    btn.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      background: linear-gradient(135deg, #4f46e5, #06b6d4);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 600;
      border-radius: 20px;
      box-shadow: 0 4px 15px rgba(79, 70, 229, 0.45);
      cursor: pointer;
      user-select: none;
      letter-spacing: 0.03em;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      border: 1px solid rgba(255,255,255,0.2);
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.05)";
      btn.style.boxShadow = "0 6px 20px rgba(79, 70, 229, 0.6)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 4px 15px rgba(79, 70, 229, 0.45)";
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = window.getSelection()?.toString()?.trim();
      if (text) {
        chrome.runtime.sendMessage({ action: "speak", text });
        hideReadButton();
      }
    });

    document.body.appendChild(btn);
    return btn;
  }

  function showReadButton(x, y) {
    if (!readBtn) readBtn = createReadButton();
    readBtn.style.display = "flex";
    // Position above the selection, keep within viewport
    const btnW = 90, btnH = 34;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.min(x - btnW / 2, vw - btnW - 10);
    let top = Math.max(y - btnH - 10, 10);
    readBtn.style.left = `${left}px`;
    readBtn.style.top = `${top}px`;
  }

  function hideReadButton() {
    if (readBtn) readBtn.style.display = "none";
  }

  // ─── Floating Control Bar ──────────────────────────────────────────────────
  function createControlBar() {
    const bar = document.createElement("div");
    bar.id = "kokoro-control-bar";
    bar.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: rgba(10, 10, 20, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(79, 70, 229, 0.3);
      border-radius: 50px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(6,182,212,0.1);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
    `;

    bar.innerHTML = `
      <div id="kokoro-wave" style="display:flex;align-items:center;gap:3px;">
        ${[1,2,3,4,5].map(i => `<div class="kokoro-bar" style="
          width:3px; height:${8+i*3}px; border-radius:2px;
          background: linear-gradient(#4f46e5, #06b6d4);
          animation: kokoro-pulse 0.8s ease-in-out ${i*0.1}s infinite alternate;
        "></div>`).join("")}
      </div>
      <span id="kokoro-status-text" style="color:rgba(255,255,255,0.8);font-size:12px;">Reading...</span>
      <button id="kokoro-pause-btn" style="
        background: rgba(255,255,255,0.1);
        border: none; border-radius: 50%;
        width: 30px; height: 30px;
        cursor: pointer; color: white;
        display:flex;align-items:center;justify-content:center;
        transition: background 0.2s;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
      </button>
      <button id="kokoro-stop-btn" style="
        background: rgba(255,255,255,0.1);
        border: none; border-radius: 50%;
        width: 30px; height: 30px;
        cursor: pointer; color: white;
        display:flex;align-items:center;justify-content:center;
        transition: background 0.2s;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="5" width="14" height="14"/>
        </svg>
      </button>
    `;

    // Inject animation CSS
    const style = document.createElement("style");
    style.textContent = `
      @keyframes kokoro-pulse {
        from { transform: scaleY(0.4); opacity: 0.6; }
        to   { transform: scaleY(1);   opacity: 1; }
      }
      #kokoro-pause-btn:hover, #kokoro-stop-btn:hover {
        background: rgba(255,255,255,0.2) !important;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(bar);

    bar.querySelector("#kokoro-pause-btn").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "toggle-pause" });
    });
    bar.querySelector("#kokoro-stop-btn").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "stop" });
    });

    return bar;
  }

  function showControlBar(status = "Reading...") {
    if (!controlBar) controlBar = createControlBar();
    controlBar.style.display = "flex";
    updateControlBar({ status });
  }

  function hideControlBar() {
    if (controlBar) controlBar.style.display = "none";
  }

  function updateControlBar({ status, isPaused, chunkIndex, totalChunks }) {
    if (!controlBar) return;
    const statusEl = controlBar.querySelector("#kokoro-status-text");
    const waveEl = controlBar.querySelector("#kokoro-wave");
    const pauseBtn = controlBar.querySelector("#kokoro-pause-btn");

    if (statusEl) {
      if (status) statusEl.textContent = status;
      else if (totalChunks > 1) statusEl.textContent = `Part ${chunkIndex + 1} of ${totalChunks}`;
    }

    if (waveEl) {
      waveEl.style.opacity = isPaused ? "0.3" : "1";
      waveEl.querySelectorAll(".kokoro-bar").forEach(b => {
        b.style.animationPlayState = isPaused ? "paused" : "running";
      });
    }

    if (pauseBtn) {
      pauseBtn.innerHTML = isPaused
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }
  }

  // ─── Selection Listener ────────────────────────────────────────────────────
  document.addEventListener("mouseup", (e) => {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      if (text && text.length > 3) {
        const range = sel.getRangeAt(0).getBoundingClientRect();
        showReadButton(
          range.left + range.width / 2 + window.scrollX,
          range.top + window.scrollY
        );
      } else {
        hideReadButton();
      }
    }, 200);
  });

  document.addEventListener("mousedown", (e) => {
    if (readBtn && !readBtn.contains(e.target)) {
      hideReadButton();
    }
  });

  // ─── State Update Handler ─────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action !== "state-update") return;
    const { state } = message;

    if (state.isPlaying) {
      showControlBar(state.status);
      updateControlBar({
        isPaused: state.isPaused,
        chunkIndex: state.chunkIndex,
        totalChunks: state.totalChunks,
        status: state.status,
      });
    } else {
      hideControlBar();
    }
  });
})();
