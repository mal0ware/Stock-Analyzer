#!/bin/bash
# Stock Analyzer — macOS Packaging Script
# Uses electron-builder to produce a signed .dmg installer.
#
# Bundles:
#   - C++ backend binary (arm64)
#   - Frontend (HTML/CSS/JS)
#   - Python 3.13 + yfinance (standalone, no system deps)
#   - Java classes + JRE 21 (standalone, no system deps)
#   - Electron shell
#
# Output: dist/Stock Analyzer-<version>-arm64.dmg
#
# Usage: bash scripts/package-macos.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ELECTRON_DIR="$PROJECT_DIR/src/electron"
BUNDLED_DIR="$ELECTRON_DIR/bundled"

export PATH="$HOME/.local/node/bin:$HOME/.local/jdk/bin:$HOME/.local/bin:$PATH"

# Prevent VS Code / Claude Code terminal from poisoning child Electron processes
unset ELECTRON_RUN_AS_NODE 2>/dev/null || true

# Bundled runtime versions
PYTHON_TAG="20250317"
PYTHON_VERSION="3.13.2"
JRE_VERSION="21"

# Detect architecture
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
    PYTHON_ARCH="aarch64"
    JRE_ARCH="aarch64"
else
    PYTHON_ARCH="x86_64"
    JRE_ARCH="x64"
fi

PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_TAG}/cpython-${PYTHON_VERSION}+${PYTHON_TAG}-${PYTHON_ARCH}-apple-darwin-install_only.tar.gz"
JRE_URL="https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/mac/${JRE_ARCH}/jre/hotspot/normal/eclipse?project=jdk"

CACHE_DIR="$PROJECT_DIR/.cache"
mkdir -p "$CACHE_DIR"

echo "========================================"
echo "  Stock Analyzer — macOS Packaging"
echo "========================================"
echo "  Architecture: $ARCH"
echo ""

# ------------------------------------------------------------------
# Stage 1: Build C++ backend
# ------------------------------------------------------------------
echo "[1/8] Building C++ backend..."
cd "$PROJECT_DIR"
make clean && make 2>&1 | tail -1
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
# Stage 3: Download bundled Python
# ------------------------------------------------------------------
echo "[3/8] Preparing bundled Python ${PYTHON_VERSION}..."

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

echo "  Installing yfinance..."
"$BUNDLED_DIR/python-env/bin/python3" -m pip install --upgrade pip --quiet 2>/dev/null || true
"$BUNDLED_DIR/python-env/bin/python3" -m pip install yfinance --quiet 2>&1 | tail -2
"$BUNDLED_DIR/python-env/bin/python3" -c "import yfinance; print(f'  yfinance {yfinance.__version__} ready.')"

# Trim test files and docs to reduce bundle size
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
# Stage 4: Download bundled JRE
# ------------------------------------------------------------------
echo "[4/8] Preparing bundled JRE ${JRE_VERSION}..."

JRE_CACHE="$CACHE_DIR/jre-${JRE_VERSION}-${JRE_ARCH}.tar.gz"
if [ ! -f "$JRE_CACHE" ]; then
    echo "  Downloading..."
    curl -L --progress-bar -o "$JRE_CACHE" "$JRE_URL"
else
    echo "  Using cached download."
fi

rm -rf "$BUNDLED_DIR/jre"
mkdir -p "$BUNDLED_DIR/jre-tmp"
echo "  Extracting..."
tar xzf "$JRE_CACHE" -C "$BUNDLED_DIR/jre-tmp" --strip-components=1

# Adoptium JRE on macOS nests under Contents/Home/
if [ -d "$BUNDLED_DIR/jre-tmp/Contents/Home/bin" ]; then
    mv "$BUNDLED_DIR/jre-tmp/Contents/Home" "$BUNDLED_DIR/jre"
    rm -rf "$BUNDLED_DIR/jre-tmp"
else
    mv "$BUNDLED_DIR/jre-tmp" "$BUNDLED_DIR/jre"
fi

"$BUNDLED_DIR/jre/bin/java" -version 2>&1 | head -1 | sed 's/^/  /'

JRE_SIZE=$(du -sh "$BUNDLED_DIR/jre" | cut -f1)
echo "  JRE bundle: $JRE_SIZE"
echo ""

# ------------------------------------------------------------------
# Stage 5: Install electron-builder
# ------------------------------------------------------------------
echo "[5/8] Installing electron-builder..."
cd "$ELECTRON_DIR"
npm install --save-dev electron-builder 2>&1 | tail -3
echo ""

# ------------------------------------------------------------------
# Stage 6: Fix permissions before packaging
# ------------------------------------------------------------------
echo "[6/8] Fixing file permissions..."
chmod +x "$PROJECT_DIR/build/stock_analyzer"
chmod -R u+rwX "$BUNDLED_DIR/python-env"
chmod -R u+rwX "$BUNDLED_DIR/jre"
find "$BUNDLED_DIR/python-env/bin" -type f -exec chmod +x {} \;
find "$BUNDLED_DIR/jre/bin" -type f -exec chmod +x {} \;
echo "  Done."
echo ""

# ------------------------------------------------------------------
# Stage 7: Build with electron-builder
# ------------------------------------------------------------------
echo "[7/8] Building .dmg with electron-builder..."
echo "  This may take a few minutes..."
echo ""

npx electron-builder --mac --arm64 2>&1

echo ""

# ------------------------------------------------------------------
# Stage 8: Ad-hoc sign (afterPack wrapper changes the main binary)
# ------------------------------------------------------------------
echo "[8/8] Ad-hoc signing..."
APP_PATH="$PROJECT_DIR/dist/mac-arm64/Stock Analyzer.app"
if [ -d "$APP_PATH" ]; then
    codesign --force --deep --sign - "$APP_PATH" 2>&1
    echo "  Done."
fi
echo ""

# ------------------------------------------------------------------
# Cleanup bundled runtimes (they're now inside the .app)
# ------------------------------------------------------------------
rm -rf "$BUNDLED_DIR"

# ------------------------------------------------------------------
# Result
# ------------------------------------------------------------------
DMG=$(find "$PROJECT_DIR/dist" -name "*.dmg" -newer "$PROJECT_DIR/build/stock_analyzer" | head -1)

if [ -n "$DMG" ]; then
    echo "========================================"
    echo "  Packaging complete!"
    echo "========================================"
    echo ""
    echo "  .dmg installer:"
    echo "    $DMG"
    echo ""
    echo "  Size: $(du -sh "$DMG" | cut -f1)"
    echo ""
    echo "  To test:"
    echo "    open \"$DMG\""
    echo ""
    echo "  For users downloading from the internet:"
    echo "    1. Open the .dmg"
    echo "    2. Drag Stock Analyzer to Applications"
    echo "    3. Right-click the app > Open (first launch only)"
    echo "    4. Click 'Open' in the Gatekeeper dialog"
    echo ""
else
    echo "ERROR: No .dmg found in dist/. Check the output above for errors."
    exit 1
fi
