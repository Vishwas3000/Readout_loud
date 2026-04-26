#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Kokoro Reader — One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Vishwas3000/Readout_loud/main/install.sh | bash
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/Vishwas3000/Readout_loud.git"
INSTALL_DIR="$HOME/.kokoro-reader"
PLIST_NAME="com.kokoro.reader"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'
RED='\033[0;31m';   BOLD='\033[1m';    NC='\033[0m'

info()    { echo -e "${CYAN}▸${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗ ERROR:${NC} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}$*${NC}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════╗"
echo "  ║       Kokoro Reader Installer      ║"
echo "  ║  Local AI Text-to-Speech for Chrome║"
echo "  ╚═══════════════════════════════════╝"
echo -e "${NC}"

# ── OS check ─────────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  error "This installer is for macOS only. For Linux/Windows, see the README."
fi

header "Step 1/5 — Checking dependencies…"

# Python 3.12
PYTHON=""
for py in python3.12 python3 python; do
  if command -v "$py" &>/dev/null; then
    ver=$($py --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    major=$(echo "$ver" | cut -d. -f1)
    minor=$(echo "$ver" | cut -d. -f2)
    if [[ "$major" -eq 3 && "$minor" -le 12 ]]; then
      PYTHON="$py"; break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  warn "Python 3.12 not found. Attempting to install via Homebrew…"
  if ! command -v brew &>/dev/null; then
    error "Homebrew not found. Install it first: https://brew.sh  Then re-run this script."
  fi
  brew install python@3.12
  PYTHON="python3.12"
fi
success "Python: $($PYTHON --version)"

# espeak-ng (for Indian/European voices)
if ! command -v espeak-ng &>/dev/null; then
  info "Installing espeak-ng (needed for Indian English voices)…"
  if command -v brew &>/dev/null; then
    brew install espeak-ng
  else
    warn "espeak-ng not found and Homebrew unavailable. Indian/European voices may not work."
  fi
else
  success "espeak-ng: $(espeak-ng --version 2>&1 | head -1)"
fi

# git
if ! command -v git &>/dev/null; then
  error "git not found. Install Xcode Command Line Tools: xcode-select --install"
fi
success "git: $(git --version)"

header "Step 2/5 — Downloading Kokoro Reader…"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing installation at $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --quiet
else
  info "Cloning to $INSTALL_DIR…"
  git clone --depth=1 "$REPO" "$INSTALL_DIR" --quiet
fi
success "Downloaded to $INSTALL_DIR"

header "Step 3/5 — Setting up Python environment…"

cd "$INSTALL_DIR/server"
if [[ ! -d ".venv" ]]; then
  info "Creating virtual environment with $PYTHON…"
  "$PYTHON" -m venv .venv
fi

info "Installing dependencies (this may take 2–3 minutes on first run)…"
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
success "Dependencies installed"

header "Step 4/5 — Installing as a background service (auto-start on login)…"

# Write LaunchAgent plist so the server starts automatically on login
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${INSTALL_DIR}/server/start_server.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${HOME}/Library/Logs/kokoro-reader.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/kokoro-reader.log</string>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}/server</string>
</dict>
</plist>
EOF

# Load it now
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
success "Service registered — will start automatically on every login"

header "Step 5/5 — Starting server…"

info "Waiting for server to come online…"
sleep 4

MAX_WAIT=30; ELAPSED=0
until curl -sf http://localhost:8880/health > /dev/null 2>&1; do
  sleep 1; ELAPSED=$((ELAPSED+1))
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    warn "Server took too long to start. Check logs: tail -f ~/Library/Logs/kokoro-reader.log"
    break
  fi
done

if curl -sf http://localhost:8880/health > /dev/null 2>&1; then
  success "Server is running at http://localhost:8880 ✓"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ Kokoro Reader installed successfully!${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Next step:${NC} Load the Chrome extension:"
echo -e "  1. Open Chrome → ${CYAN}chrome://extensions${NC}"
echo -e "  2. Enable ${BOLD}Developer mode${NC} (top right)"
echo -e "  3. Click ${BOLD}Load unpacked${NC} → select:"
echo -e "     ${CYAN}$INSTALL_DIR/extension${NC}"
echo ""
echo -e "  ${BOLD}The server starts automatically on every login.${NC}"
echo -e "  To stop: ${CYAN}launchctl unload ~/Library/LaunchAgents/${PLIST_NAME}.plist${NC}"
echo -e "  Logs:    ${CYAN}tail -f ~/Library/Logs/kokoro-reader.log${NC}"
echo ""
