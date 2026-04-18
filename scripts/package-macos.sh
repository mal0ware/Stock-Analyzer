#!/bin/bash
# Stock Analyzer — macOS Packaging Script
# Produces .dmg installers (x64 + arm64) via electron-builder.
#
# Bundles:
#   - React frontend (built with Vite)
#   - FastAPI backend (api/ source)
#   - Python 3.13 standalone + FastAPI/uvicorn/yfinance/etc.
#   - Electron shell
#
# Output: dist/Stock Analyzer-<version>-arm64.dmg, dist/Stock Analyzer-<version>.dmg
#
# Usage: bash scripts/package-macos.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ELECTRON_DIR="$PROJECT_DIR/src/electron"
BUNDLED_DIR="$ELECTRON_DIR/bundled"
FRONTEND_DIR="$PROJECT_DIR/frontend"

export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
unset ELECTRON_RUN_AS_NODE 2>/dev/null || true

PYTHON_TAG="20250317"
PYTHON_VERSION="3.13.2"

ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
    PYTHON_ARCH="aarch64"
else
    PYTHON_ARCH="x86_64"
fi

PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_TAG}/cpython-${PYTHON_VERSION}+${PYTHON_TAG}-${PYTHON_ARCH}-apple-darwin-install_only.tar.gz"

CACHE_DIR="$PROJECT_DIR/.cache"
mkdir -p "$CACHE_DIR"

echo "========================================"
echo "  Stock Analyzer — macOS Packaging"
echo "========================================"
echo "  Host architecture: $ARCH"
echo ""

# ------------------------------------------------------------------
# Stage 1: Build React frontend
# ------------------------------------------------------------------
echo "[1/4] Building React frontend..."
cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
    npm ci
fi
npm run build
echo ""

# ------------------------------------------------------------------
# Stage 2: Prepare bundled Python + FastAPI deps
# ------------------------------------------------------------------
echo "[2/4] Preparing bundled Python ${PYTHON_VERSION}..."
PYTHON_CACHE="$CACHE_DIR/python-${PYTHON_VERSION}-${PYTHON_ARCH}.tar.gz"
if [ ! -f "$PYTHON_CACHE" ]; then
    echo "  Downloading..."
    curl -L --progress-bar -o "$PYTHON_CACHE" "$PYTHON_URL"
else
    echo "  Using cached download."
fi

rm -rf "$BUNDLED_DIR/python-env"
mkdir -p "$BUNDLED_DIR/python-env"
echo "  Extracting..."
tar xzf "$PYTHON_CACHE" -C "$BUNDLED_DIR/python-env" --strip-components=1

echo "  Installing FastAPI backend dependencies..."
"$BUNDLED_DIR/python-env/bin/python3" -m pip install --upgrade pip --quiet 2>/dev/null || true
"$BUNDLED_DIR/python-env/bin/python3" -m pip install -r "$PROJECT_DIR/api/requirements.txt" --quiet 2>&1 | tail -3
"$BUNDLED_DIR/python-env/bin/python3" -c "import fastapi, uvicorn, yfinance; print(f'  fastapi {fastapi.__version__} / uvicorn {uvicorn.__version__} / yfinance {yfinance.__version__} ready.')"

echo "  Trimming unnecessary files..."
SITE_PKGS="$BUNDLED_DIR/python-env/lib/python3.13/site-packages"
find "$SITE_PKGS" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find "$SITE_PKGS" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
find "$SITE_PKGS" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$BUNDLED_DIR/python-env/lib/python3.13" -maxdepth 1 -type d \( -name "test" -o -name "tests" -o -name "idlelib" -o -name "tkinter" -o -name "turtledemo" -o -name "ensurepip" \) -exec rm -rf {} + 2>/dev/null || true
rm -rf "$BUNDLED_DIR/python-env/share" 2>/dev/null || true

PYTHON_SIZE=$(du -sh "$BUNDLED_DIR/python-env" | cut -f1)
echo "  Python bundle: $PYTHON_SIZE"
echo ""

# ------------------------------------------------------------------
# Stage 3: Install Electron tooling
# ------------------------------------------------------------------
echo "[3/4] Installing electron-builder..."
cd "$ELECTRON_DIR"
if [ ! -d node_modules ]; then
    npm install --no-fund --no-audit
fi
echo ""

# ------------------------------------------------------------------
# Stage 4: Build DMG (x64 + arm64)
# ------------------------------------------------------------------
echo "[4/4] Building .dmg with electron-builder..."
echo "  This may take a few minutes..."
npx electron-builder --mac 2>&1 | tail -20
echo ""

echo "========================================"
echo "  Build complete!"
echo "========================================"
ls -lh "$PROJECT_DIR/dist"/*.dmg 2>/dev/null | awk '{print "  "$NF" ("$5")"}'
