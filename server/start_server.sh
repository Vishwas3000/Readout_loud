#!/usr/bin/env bash
# ─── Kokoro TTS Server — Mac Launcher (requires Python 3.10-3.12) ──────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
PORT=8880

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ██╗  ██╗ ██████╗ ██╗  ██╗ ██████╗ ██████╗  ██████╗ "
echo "  ██║ ██╔╝██╔═══██╗██║ ██╔╝██╔═══██╗██╔══██╗██╔═══██╗"
echo "  █████╔╝ ██║   ██║█████╔╝ ██║   ██║██████╔╝██║   ██║"
echo "  ██╔═██╗ ██║   ██║██╔═██╗ ██║   ██║██╔══██╗██║   ██║"
echo "  ██║  ██╗╚██████╔╝██║  ██╗╚██████╔╝██║  ██║╚██████╔╝"
echo "  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ "
echo "              Local TTS Server — v1.0.0"
echo -e "${NC}"

# ─── Resolve python3.12 (kokoro 0.7.x requires Python 3.10-3.12, NOT 3.13) ───
PYTHON=""
for candidate in python3.12 python3.11 python3.10; do
  if command -v "$candidate" &>/dev/null; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  SYSVER=$(python3 --version 2>&1 | awk '{print $2}')
  MAJOR=$(echo "$SYSVER" | cut -d. -f1)
  MINOR=$(echo "$SYSVER" | cut -d. -f2)
  if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -le 12 ]; then
    PYTHON="python3"
  else
    echo -e "${RED}❌ kokoro requires Python 3.10-3.12, but found Python ${SYSVER}.${NC}"
    echo -e "${YELLOW}   Install Python 3.12: brew install python@3.12${NC}"
    exit 1
  fi
fi

PYTHON_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
echo -e "${GREEN}✅ Using Python ${PYTHON_VERSION} (${PYTHON})${NC}"

# ─── Detect if existing .venv was built with a different Python ───────────────
if [ -d "$VENV_DIR" ]; then
  VENV_PY="$VENV_DIR/bin/python"
  if [ -f "$VENV_PY" ]; then
    VENV_VER=$("$VENV_PY" --version 2>&1 | awk '{print $2}')
    if [ "$VENV_VER" != "$PYTHON_VERSION" ]; then
      echo -e "${YELLOW}⚠️  Existing .venv was Python ${VENV_VER}, rebuilding for ${PYTHON_VERSION}...${NC}"
      rm -rf "$VENV_DIR"
    fi
  fi
fi

# ─── Virtual environment ───────────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  echo -e "${YELLOW}⏳ Creating virtual environment with ${PYTHON}...${NC}"
  "$PYTHON" -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
echo -e "${GREEN}✅ Activated venv: ${VENV_DIR}${NC}"

# ─── Detect Apple Silicon ──────────────────────────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  echo -e "${GREEN}🍎 Apple Silicon detected — PyTorch will use MPS (Metal)${NC}"
else
  echo -e "${YELLOW}🖥  Intel Mac detected — using CPU${NC}"
fi

# ─── Install / upgrade dependencies ───────────────────────────────────────────
echo -e "\n${YELLOW}⏳ Checking dependencies...${NC}"
pip install --quiet --upgrade pip

if ! python -c "import torch" 2>/dev/null; then
  echo -e "${YELLOW}Installing PyTorch...${NC}"
  pip install torch torchvision torchaudio
fi

pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
echo -e "${GREEN}✅ Dependencies ready${NC}"

# ─── Port check ────────────────────────────────────────────────────────────────
if lsof -i ":${PORT}" -sTCP:LISTEN &>/dev/null; then
  echo -e "${RED}⚠️  Port ${PORT} is already in use. Kill it:${NC}"
  echo "    kill -9 \$(lsof -ti :${PORT})"
  exit 1
fi

# ─── Launch ────────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}🚀 Starting Kokoro TTS server → http://localhost:${PORT}${NC}"
echo -e "${CYAN}   📖 API docs:  http://localhost:${PORT}/docs${NC}"
echo -e "${CYAN}   💚 Health:    http://localhost:${PORT}/health${NC}"
echo -e "${YELLOW}   First run downloads Kokoro model (~300 MB)...${NC}\n"

cd "$SCRIPT_DIR"
python server.py
