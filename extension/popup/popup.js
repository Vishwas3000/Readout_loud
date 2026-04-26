/**
 * Kokoro Reader — Popup Script (v2)
 * Matches redesigned popup.html (Tailwind-based)
 */

// ── Voice metadata ─────────────────────────────────────────────────────────────
const VOICE_META = {
  // American English
  af_heart:   { accent: 'American English', gender: '♀', style: 'Warm & Natural — Best for papers ⭐', color: ['#6366f1','#06b6d4'] },
  af_bella:   { accent: 'American English', gender: '♀', style: 'Clear & Professional', color: ['#6366f1','#8b5cf6'] },
  af_sarah:   { accent: 'American English', gender: '♀', style: 'Friendly & Energetic', color: ['#f59e0b','#ef4444'] },
  af_nicole:  { accent: 'American English', gender: '♀', style: 'Soft & Calm', color: ['#10b981','#06b6d4'] },
  af_sky:     { accent: 'American English', gender: '♀', style: 'Upbeat & Bright', color: ['#f59e0b','#06b6d4'] },
  af_jessica: { accent: 'American English', gender: '♀', style: 'Expressive & Vivid', color: ['#ec4899','#6366f1'] },
  af_river:   { accent: 'American English', gender: '♀', style: 'Smooth & Flowing', color: ['#06b6d4','#10b981'] },
  am_adam:    { accent: 'American English', gender: '♂', style: 'Authority & Deep', color: ['#ef4444','#f97316'] },
  am_michael: { accent: 'American English', gender: '♂', style: 'Natural & Relaxed', color: ['#3b82f6','#6366f1'] },
  am_echo:    { accent: 'American English', gender: '♂', style: 'Clear & Neutral', color: ['#64748b','#3b82f6'] },
  am_eric:    { accent: 'American English', gender: '♂', style: 'Warm & Conversational', color: ['#f97316','#f59e0b'] },
  am_liam:    { accent: 'American English', gender: '♂', style: 'Youthful & Energetic', color: ['#10b981','#06b6d4'] },
  am_onyx:    { accent: 'American English', gender: '♂', style: 'Rich Baritone', color: ['#1e293b','#6366f1'] },
  am_orion:   { accent: 'American English', gender: '♂', style: 'Commanding & Clear', color: ['#0ea5e9','#6366f1'] },
  // British English
  bf_emma:    { accent: 'British English',  gender: '♀', style: 'Formal & Crisp', color: ['#8b5cf6','#ec4899'] },
  bf_alice:   { accent: 'British English',  gender: '♀', style: 'Elegant & Refined', color: ['#c084fc','#8b5cf6'] },
  bf_isabella:{ accent: 'British English',  gender: '♀', style: 'Warm & Storytelling', color: ['#f472b6','#8b5cf6'] },
  bf_lily:    { accent: 'British English',  gender: '♀', style: 'Soft & Gentle', color: ['#a78bfa','#60a5fa'] },
  bm_george:  { accent: 'British English',  gender: '♂', style: 'Classic & Measured', color: ['#0ea5e9','#3b82f6'] },
  bm_daniel:  { accent: 'British English',  gender: '♂', style: 'Authoritative & Clear', color: ['#1d4ed8','#0ea5e9'] },
  bm_fable:   { accent: 'British English',  gender: '♂', style: 'Narrative & Engaging', color: ['#6366f1','#8b5cf6'] },
  bm_lewis:   { accent: 'British English',  gender: '♂', style: 'Conversational', color: ['#10b981','#3b82f6'] },
  // Indian English (Hindi voices)
  hf_alpha:   { accent: 'Indian English',   gender: '♀', style: 'Clear Indian Accent', color: ['#f97316','#eab308'] },
  hf_beta:    { accent: 'Indian English',   gender: '♀', style: 'Warm Indian Accent', color: ['#f59e0b','#f97316'] },
  hm_omega:   { accent: 'Indian English',   gender: '♂', style: 'Deep Indian Accent', color: ['#16a34a','#f59e0b'] },
  hm_psi:     { accent: 'Indian English',   gender: '♂', style: 'Natural Indian Accent', color: ['#15803d','#16a34a'] },
};

// ── Elements ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  voiceSelect:    $('voice-select'),
  voiceAvatar:    $('voice-avatar'),
  voiceAccent:    $('voice-accent'),
  voiceStyle:     $('voice-style'),
  speedSlider:    $('speed-slider'),
  speedDisplay:   $('speed-display'),
  chunkSize:      $('chunk-size'),
  serverUrl:      $('server-url'),
  formatSelect:   $('format-select'),
  cleanCitations: $('clean-citations'),
  citationsLabel: $('citations-label'),
  serverDot:      $('server-status-dot'),
  serverBanner:   $('server-banner'),
  bannerDot:      $('banner-dot'),
  bannerText:     $('server-banner-text'),
  bannerDevice:   $('banner-device'),
  deviceInfo:     $('device-info'),
  waveBars:       document.querySelectorAll('.wave-bar'),
  playerGlow:     $('player-glow'),
  playbackLabel:  $('playback-label'),
  chunkProgress:  $('chunk-progress'),
  pauseIcon:      $('pause-icon'),
  pauseLabel:     $('pause-label'),
};

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.runtime.sendMessage({ action: 'get-settings' });
  els.voiceSelect.value    = s.voice      || 'af_heart';
  els.speedSlider.value    = s.speed      || 1.0;
  els.speedDisplay.textContent = parseFloat(els.speedSlider.value).toFixed(2);
  els.chunkSize.value      = s.chunkSize  || 2000;
  els.serverUrl.value      = s.serverUrl  || 'http://localhost:8880';
  els.formatSelect.value   = s.responseFormat || 'wav';
  els.cleanCitations.checked = s.autoCleanCitations !== false;
  updateVoiceCard(els.voiceSelect.value);
  updateSpeedPresets(parseFloat(els.speedSlider.value));
  updateCitationsLabel();
}

async function saveSettings() {
  await chrome.runtime.sendMessage({
    action: 'save-settings',
    settings: {
      voice:              els.voiceSelect.value,
      speed:              parseFloat(els.speedSlider.value),
      chunkSize:          parseInt(els.chunkSize.value, 10),
      serverUrl:          els.serverUrl.value.trim(),
      responseFormat:     els.formatSelect.value,
      autoCleanCitations: els.cleanCitations.checked,
    },
  });
  // Flash success
  const btn = $('btn-save-settings');
  const orig = btn.textContent;
  btn.textContent = '✓ Saved!';
  btn.style.background = 'linear-gradient(135deg, #10b981, #06b6d4)';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
  }, 1800);
}

// ── Voice card ─────────────────────────────────────────────────────────────────
function updateVoiceCard(voiceId) {
  const meta = VOICE_META[voiceId] || VOICE_META['af_heart'];
  els.voiceAvatar.textContent = meta.gender;
  els.voiceAvatar.style.background = `linear-gradient(135deg, ${meta.color[0]}, ${meta.color[1]})`;
  els.voiceAccent.textContent = meta.accent;
  els.voiceStyle.innerHTML = meta.style;
}

// ── Speed ──────────────────────────────────────────────────────────────────────
function updateSpeedPresets(val) {
  document.querySelectorAll('.speed-preset').forEach(btn => {
    const isMatch = parseFloat(btn.dataset.speed) === val;
    btn.classList.toggle('is-active', isMatch);
    if (isMatch) {
      btn.style.background = 'rgba(99,102,241,0.2)';
      btn.style.borderColor = 'rgba(99,102,241,0.4)';
      btn.style.color = '#a5b4fc';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  });
}

function updateCitationsLabel() {
  els.citationsLabel.textContent = els.cleanCitations.checked ? 'On' : 'Off';
}

// ── Server health ──────────────────────────────────────────────────────────────
async function checkServer(url) {
  setBanner('checking', 'Checking server…');
  els.serverDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 transition-all duration-500 ring-2 ring-slate-950 dot-checking';

  const result = await chrome.runtime.sendMessage({
    action: 'health-check',
    serverUrl: url || els.serverUrl.value.trim(),
  });

  if (result.ok) {
    const device = result.device || 'cpu';
    const deviceLabel = { cuda: 'NVIDIA GPU (CUDA)', mps: 'Apple Metal (MPS)', cpu: 'CPU' }[device] || device;
    setBanner('ok', `Connected · ${deviceLabel}`);
    els.serverDot.className = 'w-2.5 h-2.5 rounded-full transition-all duration-500 ring-2 ring-slate-950 dot-ok';
    els.deviceInfo.textContent = `Kokoro-82M · ${deviceLabel}`;
    els.bannerDevice.textContent = `${result.model_loaded ? '' : '⚠ model loading'}`;
  } else {
    setBanner('error', result.error || 'Server unreachable — run ./start_server.sh');
    els.serverDot.className = 'w-2.5 h-2.5 rounded-full transition-all duration-500 ring-2 ring-slate-950 dot-error';
  }
}

function setBanner(state, text) {
  els.serverBanner.className = `banner-${state} flex items-center gap-2 px-4 py-1.5 text-[11px] font-semibold shrink-0 transition-all duration-300`;
  els.bannerText.textContent = text;
  els.bannerDot.className = `w-1.5 h-1.5 rounded-full shrink-0 ${
    state === 'ok' ? 'bg-emerald-400' : state === 'error' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'
  }`;
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
const PANELS = ['voice', 'speed', 'settings'];
function activateTab(name) {
  PANELS.forEach(p => {
    const panel = $(`panel-${p}`);
    const tab   = $(`tab-${p}`);
    const active = p === name;
    panel.classList.toggle('hidden', !active);
    tab.classList.toggle('is-active', active);
  });
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// ── Playback UI ────────────────────────────────────────────────────────────────
const PAUSE_ICON_SVG = {
  paused:  `<polygon points="5 3 19 12 5 21 5 3"/>`,
  playing: `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`,
};

function updatePlaybackUI(state) {
  const playing = state.isPlaying;
  const paused  = state.isPaused;

  // Wave bars
  els.waveBars.forEach((bar, i) => {
    if (playing && !paused) {
      bar.style.opacity = '1';
      bar.classList.add('wave-playing');
    } else if (paused) {
      bar.style.opacity = '0.4';
      bar.classList.remove('wave-playing');
      bar.style.height = '4px';
    } else {
      bar.style.opacity = '0.15';
      bar.classList.remove('wave-playing');
      bar.style.height = '4px';
    }
  });

  // Player glow
  if (els.playerGlow) els.playerGlow.style.opacity = playing ? '1' : '0';

  // Status label
  if (playing) {
    els.playbackLabel.textContent = paused ? 'Paused' : (state.status || 'Reading…');
    els.playbackLabel.className = paused
      ? 'text-xs text-amber-400/80 font-medium truncate'
      : 'text-xs text-emerald-400/80 font-medium truncate';
  } else {
    els.playbackLabel.textContent = 'Not playing';
    els.playbackLabel.className = 'text-xs text-slate-500 font-medium truncate';
  }

  // Chunk progress
  if (playing && state.totalChunks > 1) {
    els.chunkProgress.textContent = `Part ${state.chunkIndex + 1} / ${state.totalChunks}`;
    els.chunkProgress.classList.remove('hidden');
  } else {
    els.chunkProgress.classList.add('hidden');
  }

  // Pause button icon/label
  els.pauseIcon.innerHTML = paused ? PAUSE_ICON_SVG.paused : PAUSE_ICON_SVG.playing;
  els.pauseLabel.textContent = paused ? 'Resume' : 'Pause';
}

// ── Event: read selection ──────────────────────────────────────────────────────
$('btn-read-selection').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection()?.toString()?.trim() || '',
  });
  const text = results?.[0]?.result;
  if (text) {
    chrome.runtime.sendMessage({ action: 'speak', text, tabId: tab.id });
    window.close();
  } else {
    els.playbackLabel.textContent = '⚠ Select some text first';
    els.playbackLabel.className = 'text-xs text-amber-400 font-medium truncate';
    setTimeout(() => updatePlaybackUI({ isPlaying: false }), 2200);
  }
});

// ── Event: read full page ──────────────────────────────────────────────────────
$('btn-read-page').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const clone = document.body.cloneNode(true);
      ['script','style','noscript','nav','header','footer','aside','[role="banner"]','[role="navigation"]']
        .forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));
      return clone.innerText.replace(/\s{3,}/g, '\n\n').trim().slice(0, 20000);
    },
  });
  const text = results?.[0]?.result;
  if (text) {
    chrome.runtime.sendMessage({ action: 'speak', text, tabId: tab.id });
    window.close();
  }
});

// ── Event: stop / pause ───────────────────────────────────────────────────────
$('btn-stop').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'stop' }));
$('btn-pause').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'toggle-pause' }));

// ── Event: save / test ────────────────────────────────────────────────────────
$('btn-save-settings').addEventListener('click', saveSettings);
$('btn-check-server').addEventListener('click', () => checkServer(els.serverUrl.value.trim()));

// ── Event: voice change — auto-save immediately ───────────────────────────────
els.voiceSelect.addEventListener('change', async () => {
  const voice = els.voiceSelect.value;
  updateVoiceCard(voice);
  // Save voice immediately — no need to go to Settings tab
  await chrome.runtime.sendMessage({ action: 'save-settings', settings: { voice } });
  // Brief visual feedback on the voice card
  const orig = els.voiceStyle.innerHTML;
  els.voiceStyle.innerHTML = '<span style="color:#34d399">✓ Voice saved</span>';
  setTimeout(() => { els.voiceStyle.innerHTML = orig; }, 1200);
});

// ── Event: speed change — auto-save on slider release ────────────────────────
els.speedSlider.addEventListener('input', () => {
  const v = parseFloat(els.speedSlider.value);
  els.speedDisplay.textContent = v.toFixed(2);
  updateSpeedPresets(v);
});
els.speedSlider.addEventListener('change', async () => {
  // Save when user releases the slider (not on every tick)
  await chrome.runtime.sendMessage({
    action: 'save-settings',
    settings: { speed: parseFloat(els.speedSlider.value) },
  });
});
document.querySelectorAll('.speed-preset').forEach(btn => {
  btn.addEventListener('click', async () => {
    const v = parseFloat(btn.dataset.speed);
    els.speedSlider.value = v;
    els.speedDisplay.textContent = v.toFixed(2);
    updateSpeedPresets(v);
    await chrome.runtime.sendMessage({ action: 'save-settings', settings: { speed: v } });
  });
});

// ── Event: citations toggle ───────────────────────────────────────────────────
els.cleanCitations.addEventListener('change', updateCitationsLabel);

// ── State updates from background ────────────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.action === 'state-update') updatePlaybackUI(msg.state);
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  await loadSettings();
  const state = await chrome.runtime.sendMessage({ action: 'get-state' });
  updatePlaybackUI(state);
  checkServer();
})();
