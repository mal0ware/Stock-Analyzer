#!/bin/bash
# Stock Analyzer — Windows Packaging Script (run from WSL2 Ubuntu)
# Uses electron-builder to produce a self-contained Windows NSIS installer.
#
# This script is designed to run from WSL2 Ubuntu on Windows 11.
# It cross-compiles the C++ backend for Windows using MinGW, bundles
# standalone Windows Python + JRE, and produces a .exe installer.
#
# Bundles:
#   - C++ backend binary (Windows x64 .exe)
#   - Frontend (HTML/CSS/JS)
#   - Python 3.13 + yfinance (standalone Windows embed, no system deps)
#   - Java classes + JRE 21 (standalone Windows, no system deps)
#   - Electron shell (Windows)
#
# Prerequisites (installed automatically if apt is available):
#   - x86_64-w64-mingw32-g++ (MinGW cross-compiler)
#   - Node.js with npm
#
# Output: dist/Stock Analyzer Setup <version>.exe
#
# Usage: bash scripts/package-windows.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ELECTRON_DIR="$PROJECT_DIR/src/electron"
BUNDLED_DIR="$ELECTRON_DIR/bundled"

export PATH="$HOME/.local/node/bin:$HOME/.local/jdk/bin:$HOME/.local/bin:$PATH"

# Prevent VS Code / Claude Code terminal from poisoning child Electron processes
unset ELECTRON_RUN_AS_NODE 2>/dev/null || true

# Bundled runtime versions
PYTHON_VERSION="3.13.2"
JRE_VERSION="21"

CACHE_DIR="$PROJECT_DIR/.cache"
mkdir -p "$CACHE_DIR"

echo "========================================"
echo "  Stock Analyzer — Windows Packaging"
echo "========================================"
echo ""

# ------------------------------------------------------------------
# Pre-flight: Ensure MinGW cross-compiler is available
# ------------------------------------------------------------------
echo "[0/8] Checking prerequisites..."

if ! command -v x86_64-w64-mingw32-g++ &>/dev/null; then
    echo "  MinGW cross-compiler not found. Installing..."
    if command -v apt &>/dev/null; then
        sudo apt update -qq && sudo apt install -y -qq g++-mingw-w64-x86-64 2>/dev/null
    else
        echo "ERROR: x86_64-w64-mingw32-g++ is required but not installed."
        echo "  Install with: sudo apt install g++-mingw-w64-x86-64"
        exit 1
    fi
fi
echo "  MinGW: $(x86_64-w64-mingw32-g++ --version | head -1)"

if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js is required. Run scripts/setup.sh first."
    exit 1
fi
echo "  Node.js: $(node --version)"
echo ""

# ------------------------------------------------------------------
# Stage 1: Cross-compile C++ backend for Windows
# ------------------------------------------------------------------
echo "[1/8] Cross-compiling C++ backend for Windows..."
cd "$PROJECT_DIR"

MINGW_CXX="x86_64-w64-mingw32-g++"
WIN_SOURCES="src/cpp/main.cpp src/cpp/server.cpp src/cpp/analysis.cpp src/cpp/cache.cpp"
WIN_TARGET="build/stock_analyzer.exe"

mkdir -p build

# Build the Windows-compatible subprocess module
# Windows uses CreateProcess instead of fork/execvp
$MINGW_CXX -std=c++17 -O2 -Wall \
    -Ilib -Isrc/cpp \
    -DWIN32 -D_WIN32 \
    -o "$WIN_TARGET" \
    $WIN_SOURCES \
    src/cpp/subprocess.cpp \
    -lws2_32 -lwinhttp \
    -static -static-libgcc -static-libstdc++ \
    -pthread 2>&1 | tail -5

if [ ! -f "$WIN_TARGET" ]; then
    echo ""
    echo "  Cross-compilation failed. This is expected if subprocess.cpp"
    echo "  uses POSIX-only APIs (fork/execvp). See the note below."
    echo ""
    echo "  The Windows backend will use the FastAPI Python backend instead."
    echo "  The installer will bundle Python with uvicorn as the backend."
    echo ""
    USE_PYTHON_BACKEND=true
else
    echo "  Done: $WIN_TARGET"
    USE_PYTHON_BACKEND=false
fi
echo ""

# ------------------------------------------------------------------
# Stage 2: Compile Java classes
# ------------------------------------------------------------------
echo "[2/8] Compiling Java..."
JAVAC=""
if command -v javac &>/dev/null; then
    JAVAC="javac"
elif [ -f "$HOME/.local/jdk/bin/javac" ]; then
    JAVAC="$HOME/.local/jdk/bin/javac"
fi

if [ -n "$JAVAC" ]; then
    mkdir -p build/java
    "$JAVAC" -d build/java src/java/src/analyzer/*.java 2>/dev/null
    echo "  Done."
else
    echo "  WARNING: javac not found — using existing build/java/."
fi
echo ""

# ------------------------------------------------------------------
# Stage 3: Download bundled Python (Windows embeddable)
# ------------------------------------------------------------------
echo "[3/8] Preparing bundled Python ${PYTHON_VERSION} (Windows)..."

PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"
PYTHON_FULL_URL="https://github.com/indygreg/python-build-standalone/releases/download/20250317/cpython-${PYTHON_VERSION}+20250317-x86_64-pc-windows-msvc-install_only.tar.gz"

PYTHON_CACHE="$CACHE_DIR/python-${PYTHON_VERSION}-windows-x64.tar.gz"
if [ ! -f "$PYTHON_CACHE" ]; then
    echo "  Downloading standalone Python..."
    curl -L --progress-bar -o "$PYTHON_CACHE" "$PYTHON_FULL_URL"
else
    echo "  Using cached download."
fi

rm -rf "$BUNDLED_DIR/python-env"
mkdir -p "$BUNDLED_DIR/python-env"
echo "  Extracting..."
tar xzf "$PYTHON_CACHE" -C "$BUNDLED_DIR/python-env" --strip-components=1

# Install yfinance and its deps into the bundled Python
echo "  Installing yfinance..."
"$BUNDLED_DIR/python-env/python.exe" -m pip install --upgrade pip --quiet 2>/dev/null || \
    "$BUNDLED_DIR/python-env/python3.exe" -m pip install --upgrade pip --quiet 2>/dev/null || \
    echo "  Note: pip upgrade skipped (will install packages directly)"

# Try multiple approaches for pip install on Windows Python from WSL
PYTHON_WIN=""
for candidate in "$BUNDLED_DIR/python-env/python.exe" "$BUNDLED_DIR/python-env/python3.exe" "$BUNDLED_DIR/python-env/python"; do
    if [ -f "$candidate" ]; then
        PYTHON_WIN="$candidate"
        break
    fi
done

if [ -n "$PYTHON_WIN" ]; then
    # Use host Python to install packages into the Windows Python's site-packages
    # since running .exe from WSL may not work for pip
    echo "  Installing packages via host pip into Windows bundle..."
    SITE_PKGS=$(find "$BUNDLED_DIR/python-env" -type d -name "site-packages" 2>/dev/null | head -1)
    if [ -z "$SITE_PKGS" ]; then
        SITE_PKGS="$BUNDLED_DIR/python-env/Lib/site-packages"
        mkdir -p "$SITE_PKGS"
    fi
    python3 -m pip install yfinance numpy --target "$SITE_PKGS" --quiet 2>&1 | tail -2 || \
        pip install yfinance numpy --target "$SITE_PKGS" --quiet 2>&1 | tail -2 || \
        echo "  WARNING: Could not install yfinance into Windows bundle. User may need to install manually."
fi

# Trim test files and docs to reduce bundle size
echo "  Trimming unnecessary files..."
find "$BUNDLED_DIR/python-env" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find "$BUNDLED_DIR/python-env" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
find "$BUNDLED_DIR/python-env" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

PYTHON_SIZE=$(du -sh "$BUNDLED_DIR/python-env" | cut -f1)
echo "  Python bundle: $PYTHON_SIZE"
echo ""

# ------------------------------------------------------------------
# Stage 4: Download bundled JRE (Windows)
# ------------------------------------------------------------------
echo "[4/8] Preparing bundled JRE ${JRE_VERSION} (Windows)..."

JRE_CACHE="$CACHE_DIR/jre-${JRE_VERSION}-windows-x64.zip"
JRE_URL="https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk"
if [ ! -f "$JRE_CACHE" ]; then
    echo "  Downloading..."
    curl -L --progress-bar -o "$JRE_CACHE" "$JRE_URL"
else
    echo "  Using cached download."
fi

rm -rf "$BUNDLED_DIR/jre"
mkdir -p "$BUNDLED_DIR/jre-tmp"
echo "  Extracting..."

# Adoptium Windows JRE comes as a .zip
if file "$JRE_CACHE" | grep -qi "zip"; then
    unzip -q "$JRE_CACHE" -d "$BUNDLED_DIR/jre-tmp"
else
    tar xzf "$JRE_CACHE" -C "$BUNDLED_DIR/jre-tmp" --strip-components=1
fi

# Find the actual JRE directory (may be nested)
JRE_INNER=$(find "$BUNDLED_DIR/jre-tmp" -name "bin" -type d | head -1)
if [ -n "$JRE_INNER" ]; then
    mv "$(dirname "$JRE_INNER")" "$BUNDLED_DIR/jre" 2>/dev/null || \
        mv "$BUNDLED_DIR/jre-tmp" "$BUNDLED_DIR/jre"
else
    mv "$BUNDLED_DIR/jre-tmp" "$BUNDLED_DIR/jre"
fi
rm -rf "$BUNDLED_DIR/jre-tmp"

JRE_SIZE=$(du -sh "$BUNDLED_DIR/jre" | cut -f1)
echo "  JRE bundle: $JRE_SIZE"
echo ""

# ------------------------------------------------------------------
# Stage 5: Build PyInstaller backend (self-contained .exe)
# ------------------------------------------------------------------
echo "[5/8] Building PyInstaller backend..."

# PyInstaller must run on Windows Python to produce a Windows exe.
# From WSL2, we invoke the Windows Python via the bundled standalone build.
PYINST_PYTHON="$BUNDLED_DIR/python-env/python.exe"
PYINST_OUTPUT="$BUNDLED_DIR/market-analyst-api"

if [ -f "$PYINST_PYTHON" ]; then
    # Install PyInstaller into the bundled Windows Python
    echo "  Installing PyInstaller into Windows Python bundle..."
    SITE_PKGS=$(find "$BUNDLED_DIR/python-env" -type d -name "site-packages" 2>/dev/null | head -1)
    if [ -z "$SITE_PKGS" ]; then
        SITE_PKGS="$BUNDLED_DIR/python-env/Lib/site-packages"
        mkdir -p "$SITE_PKGS"
    fi

    # Install PyInstaller + all backend deps into the Windows Python
    python3 -m pip install pyinstaller --target "$SITE_PKGS" --quiet 2>&1 | tail -2 || true
    python3 -m pip install -r "$PROJECT_DIR/api/requirements.txt" --target "$SITE_PKGS" --quiet 2>&1 | tail -2 || true

    # Build the frontend so it can be bundled into the backend
    echo "  Building frontend for embedding..."
    if [ -d "$PROJECT_DIR/frontend" ] && [ -f "$PROJECT_DIR/frontend/package.json" ]; then
        (cd "$PROJECT_DIR/frontend" && npm install --quiet 2>&1 | tail -1 && npm run build --quiet 2>&1 | tail -1) || true
    fi

    # Run PyInstaller via the Windows Python (works from WSL2 with interop)
    echo "  Running PyInstaller..."
    cd "$PROJECT_DIR"
    "$PYINST_PYTHON" -m PyInstaller market-analyst-api.spec \
        --distpath "$BUNDLED_DIR" \
        --workpath "$PROJECT_DIR/build/pyinstaller-work" \
        --noconfirm 2>&1 | tail -10

    if [ -d "$PYINST_OUTPUT" ] && [ -f "$PYINST_OUTPUT/market-analyst-api.exe" ]; then
        echo "  PyInstaller build succeeded."
        USE_PYTHON_BACKEND=false
    else
        echo "  PyInstaller build failed — falling back to bundled Python + source."
        USE_PYTHON_BACKEND=true
    fi
else
    echo "  Windows Python not available for PyInstaller. Using source fallback."
    USE_PYTHON_BACKEND=true
fi

# If PyInstaller failed, bundle the raw API source as a fallback
if [ "$USE_PYTHON_BACKEND" = true ]; then
    echo "  Bundling API source as fallback..."
    mkdir -p "$BUNDLED_DIR/api"
    cp -r "$PROJECT_DIR/api/"*.py "$BUNDLED_DIR/api/"
    cp -r "$PROJECT_DIR/api/routes" "$BUNDLED_DIR/api/routes" 2>/dev/null || true
    cp -r "$PROJECT_DIR/api/db" "$BUNDLED_DIR/api/db" 2>/dev/null || true
    cp -r "$PROJECT_DIR/api/ingestion" "$BUNDLED_DIR/api/ingestion" 2>/dev/null || true
    cp -r "$PROJECT_DIR/ml" "$BUNDLED_DIR/api/ml" 2>/dev/null || true
    cp "$PROJECT_DIR/api/requirements.txt" "$BUNDLED_DIR/api/"
    # Install all backend deps into bundled Python
    python3 -m pip install -r "$PROJECT_DIR/api/requirements.txt" --target "$SITE_PKGS" --quiet 2>&1 | tail -2 || true
fi

echo "  Done."
echo ""

# ------------------------------------------------------------------
# Stage 6: Install electron-builder
# ------------------------------------------------------------------
echo "[6/8] Installing electron-builder..."
cd "$ELECTRON_DIR"
npm install --save-dev electron-builder 2>&1 | tail -3
echo ""

# ------------------------------------------------------------------
# Stage 7: Fix permissions
# ------------------------------------------------------------------
echo "[7/8] Fixing file permissions..."
if [ -f "$PROJECT_DIR/build/stock_analyzer.exe" ]; then
    chmod +x "$PROJECT_DIR/build/stock_analyzer.exe"
fi
chmod -R u+rwX "$BUNDLED_DIR/python-env"
chmod -R u+rwX "$BUNDLED_DIR/jre"
if [ -d "$BUNDLED_DIR/market-analyst-api" ]; then
    chmod -R u+rwX "$BUNDLED_DIR/market-analyst-api"
fi
echo "  Done."
echo ""

# ------------------------------------------------------------------
# Stage 8: Build with electron-builder (Windows target)
# ------------------------------------------------------------------
echo "[8/8] Building Windows installer with electron-builder..."
echo "  This may take several minutes..."
echo ""

cd "$ELECTRON_DIR"
npx electron-builder --win --x64 2>&1

echo ""

# ------------------------------------------------------------------
# Cleanup bundled runtimes (they're now inside the installer)
# ------------------------------------------------------------------
rm -rf "$BUNDLED_DIR"

# ------------------------------------------------------------------
# Result
# ------------------------------------------------------------------
INSTALLER=$(find "$PROJECT_DIR/dist" -name "*.exe" -newer "$PROJECT_DIR/build/stock_analyzer" 2>/dev/null | head -1)
if [ -z "$INSTALLER" ]; then
    INSTALLER=$(find "$PROJECT_DIR/dist" -name "*.exe" | head -1)
fi

if [ -n "$INSTALLER" ]; then
    echo "========================================"
    echo "  Packaging complete!"
    echo "========================================"
    echo ""
    echo "  Windows installer:"
    echo "    $INSTALLER"
    echo ""
    echo "  Size: $(du -sh "$INSTALLER" | cut -f1)"
    echo ""
    echo "  To install:"
    echo "    1. Copy the .exe to Windows (e.g., /mnt/c/Users/you/Desktop/)"
    echo "    2. Double-click the installer"
    echo "    3. Follow the setup wizard"
    echo ""
    echo "  If built from WSL, copy to Windows:"
    echo "    cp \"$INSTALLER\" /mnt/c/Users/\$(cmd.exe /c echo %USERNAME% 2>/dev/null | tr -d '\\r')/Desktop/"
    echo ""
else
    echo "ERROR: No .exe installer found in dist/. Check the output above for errors."
    exit 1
fi
