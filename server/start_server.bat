@echo off
REM ─── Kokoro TTS Server — Windows Launcher ──────────────────────────────────
setlocal EnableDelayedExpansion

set PORT=8880
set SCRIPT_DIR=%~dp0

echo.
echo   ██╗  ██╗ ██████╗ ██╗  ██╗ ██████╗ ██████╗  ██████╗
echo   ██║ ██╔╝██╔═══██╗██║ ██╔╝██╔═══██╗██╔══██╗██╔═══██╗
echo   █████╔╝ ██║   ██║█████╔╝ ██║   ██║██████╔╝██║   ██║
echo   ██╔═██╗ ██║   ██║██╔═██╗ ██║   ██║██╔══██╗██║   ██║
echo   ██║  ██╗╚██████╔╝██║  ██╗╚██████╔╝██║  ██║╚██████╔╝
echo   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝
echo               Local TTS Server - v1.0.0
echo.

REM ─── Python check ────────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install from https://python.org
    pause
    exit /b 1
)

REM ─── NVIDIA GPU detection ────────────────────────────────────────────────────
nvidia-smi >nul 2>&1
if not errorlevel 1 (
    echo [INFO] NVIDIA GPU detected - will use CUDA
    set USE_CUDA=1
) else (
    echo [INFO] No NVIDIA GPU - using CPU
    set USE_CUDA=0
)

REM ─── Virtual environment ─────────────────────────────────────────────────────
if not exist "%SCRIPT_DIR%.venv" (
    echo [INFO] Creating virtual environment...
    python -m venv "%SCRIPT_DIR%.venv"
)

call "%SCRIPT_DIR%.venv\Scripts\activate.bat"

REM ─── Install PyTorch ─────────────────────────────────────────────────────────
python -c "import torch" >nul 2>&1
if errorlevel 1 (
    if "!USE_CUDA!"=="1" (
        echo [INFO] Installing PyTorch with CUDA 12.1 support...
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    ) else (
        echo [INFO] Installing PyTorch CPU-only...
        pip install torch torchvision torchaudio
    )
)

REM ─── Install dependencies ────────────────────────────────────────────────────
echo [INFO] Installing dependencies...
pip install -q -r "%SCRIPT_DIR%requirements.txt"

REM ─── Port check ──────────────────────────────────────────────────────────────
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [ERROR] Port %PORT% is already in use.
    echo         Run: netstat -ano ^| findstr :%PORT%
    echo         Then: taskkill /PID ^<PID^> /F
    pause
    exit /b 1
)

REM ─── Launch ──────────────────────────────────────────────────────────────────
echo.
echo [INFO] Starting Kokoro TTS server on http://localhost:%PORT%
echo [INFO] API docs: http://localhost:%PORT%/docs
echo [INFO] First startup downloads the model (~300MB) - please wait...
echo.

cd /d "%SCRIPT_DIR%"
python server.py

pause
