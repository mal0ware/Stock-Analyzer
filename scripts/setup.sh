#!/bin/bash
# Stock Analyzer — One-time setup script
# Installs all dependencies and builds the application
# Works with or without sudo access

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "  Stock Analyzer — Setup"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

success() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

HAS_SUDO=false
if sudo -n true 2>/dev/null; then
    HAS_SUDO=true
fi

# Ensure local bin dirs are on PATH
export PATH="$HOME/.local/bin:$HOME/.local/jdk/bin:$PATH"

# ---- Step 1: System dependencies ----
echo "Step 1/5: Checking system dependencies..."

if [ "$HAS_SUDO" = true ]; then
    if command -v apt &> /dev/null; then
        sudo apt update -qq
        sudo apt install -y -qq cmake g++ default-jdk pkg-config python3-pip 2>/dev/null || true

        # Try webkit2gtk-4.1 first, then 4.0
        if ! dpkg -l 2>/dev/null | grep -q libwebkit2gtk-4.1-dev; then
            if apt-cache show libwebkit2gtk-4.1-dev &>/dev/null; then
                sudo apt install -y -qq libwebkit2gtk-4.1-dev 2>/dev/null || true
            elif apt-cache show libwebkit2gtk-4.0-dev &>/dev/null; then
                sudo apt install -y -qq libwebkit2gtk-4.0-dev 2>/dev/null || true
            fi
        fi
        success "System packages checked"
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y cmake gcc-c++ java-11-openjdk-devel python3-pip webkit2gtk4.1-devel pkgconf-pkg-config 2>/dev/null || true
        success "System packages checked"
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm cmake gcc jdk-openjdk python-pip webkit2gtk pkg-config 2>/dev/null || true
        success "System packages checked"
    fi
else
    warn "No sudo access — installing to user directories where possible"
fi

# Check for g++
if ! command -v g++ &> /dev/null; then
    fail "g++ not found. Please install it: sudo apt install g++"
fi
success "g++ found"

# ---- Step 2: Java (install locally if needed) ----
echo ""
echo "Step 2/5: Setting up Java..."

if ! command -v javac &> /dev/null; then
    if [ -f "$HOME/.local/jdk/bin/javac" ]; then
        success "Java found at ~/.local/jdk"
    else
        echo "  Installing JDK 17 to ~/.local/jdk ..."
        mkdir -p "$HOME/.local/jdk"
        curl -sL "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk" -o /tmp/jdk.tar.gz
        tar xzf /tmp/jdk.tar.gz -C "$HOME/.local/jdk" --strip-components=1
        rm -f /tmp/jdk.tar.gz
        export PATH="$HOME/.local/jdk/bin:$PATH"
        success "JDK 17 installed to ~/.local/jdk"
    fi
else
    success "Java found: $(javac --version 2>&1 | head -1)"
fi

# ---- Step 3: Python dependencies ----
echo ""
echo "Step 3/5: Installing Python dependencies..."

# Bootstrap pip if needed
if ! command -v pip &>/dev/null && ! command -v pip3 &>/dev/null && ! python3 -m pip --version &>/dev/null; then
    echo "  Bootstrapping pip..."
    curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
    python3 /tmp/get-pip.py --user --break-system-packages 2>/dev/null || python3 /tmp/get-pip.py --user 2>/dev/null
    rm -f /tmp/get-pip.py
    export PATH="$HOME/.local/bin:$PATH"
fi

# Install yfinance
cd "$PROJECT_DIR"
pip install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null || \
pip install -r src/python/requirements.txt --user --quiet 2>/dev/null || \
pip install -r src/python/requirements.txt --quiet 2>/dev/null || \
pip3 install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null || \
pip3 install -r src/python/requirements.txt --user --quiet 2>/dev/null || \
python3 -m pip install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null || \
python3 -m pip install -r src/python/requirements.txt --user --quiet 2>/dev/null || \
python3 -m pip install -r src/python/requirements.txt --quiet 2>/dev/null

success "Python dependencies installed"

# ---- Step 4: Compile Java ----
echo ""
echo "Step 4/5: Compiling Java modules..."

mkdir -p "$PROJECT_DIR/build/java"

if command -v javac &> /dev/null; then
    javac -d "$PROJECT_DIR/build/java" "$PROJECT_DIR/src/java/src/analyzer/"*.java
    success "Java modules compiled"
else
    warn "javac not found. Java interpretation features will be unavailable."
fi

# ---- Step 5: Build C++ application ----
echo ""
echo "Step 5/5: Building C++ application..."

cd "$PROJECT_DIR"

# Use Makefile (works without cmake)
make clean 2>/dev/null || true
make 2>&1 | grep -v "^Building\|^Install"

if [ -f build/stock_analyzer ]; then
    success "C++ application built successfully"
else
    fail "Build failed. Check the output above for errors."
fi

# Copy assets
cp -r src/frontend build/frontend 2>/dev/null
cp -r src/python build/python 2>/dev/null

# ---- Verify ----
echo ""
echo "Verifying installation..."

ALL_GOOD=true

[ -f build/stock_analyzer ] && success "C++ binary: OK" || { warn "C++ binary: MISSING"; ALL_GOOD=false; }
python3 -c "import yfinance" 2>/dev/null && success "Python yfinance: OK" || { warn "Python yfinance: MISSING"; ALL_GOOD=false; }
[ -f build/java/analyzer/Interpreter.class ] && success "Java interpreter: OK" || { warn "Java interpreter: MISSING"; ALL_GOOD=false; }
[ -f build/frontend/index.html ] && success "Frontend files: OK" || { warn "Frontend files: MISSING"; ALL_GOOD=false; }

echo ""
if [ "$ALL_GOOD" = true ]; then
    echo "========================================"
    echo -e "  ${GREEN}Setup complete!${NC}"
    echo "========================================"
    echo ""
    echo "  To launch:"
    echo "    ./scripts/run.sh"
    echo ""
    echo "  For headless mode (opens in browser):"
    echo "    ./scripts/run.sh --headless"
    echo "    Then open http://localhost:8089"
    echo ""
else
    echo "========================================"
    echo -e "  ${YELLOW}Setup completed with warnings.${NC}"
    echo "  Some features may be unavailable."
    echo "========================================"
fi
