#!/bin/bash
# Stock Analyzer — One-time setup script
# Installs all dependencies and builds the application
# Works on macOS, Linux, and WSL2

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

# Detect OS
OS="unknown"
ARCH="$(uname -m)"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
elif [[ "$OSTYPE" == "linux"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
fi

echo "Detected: $OS ($ARCH)"
echo ""

HAS_SUDO=false
if [ "$OS" != "mac" ] && sudo -n true 2>/dev/null; then
    HAS_SUDO=true
fi

# Ensure local bin dirs are on PATH
export PATH="$HOME/.local/bin:$HOME/.local/jdk/bin:$HOME/.local/node/bin:$PATH"

# ==============================================================
# Step 1: C++ compiler
# ==============================================================
echo "Step 1/5: Checking C++ compiler..."

if [ "$OS" = "mac" ]; then
    # macOS: need Xcode Command Line Tools for g++/clang++
    if ! command -v g++ &>/dev/null && ! command -v clang++ &>/dev/null; then
        echo "  Installing Xcode Command Line Tools (this may open a dialog)..."
        xcode-select --install 2>/dev/null || true
        echo ""
        echo "  ┌─────────────────────────────────────────────────┐"
        echo "  │  A popup may have appeared asking to install     │"
        echo "  │  developer tools. Click 'Install' and wait for  │"
        echo "  │  it to finish, then run this script again.       │"
        echo "  └─────────────────────────────────────────────────┘"
        echo ""
        fail "Please install Xcode Command Line Tools first, then re-run this script."
    fi
    success "C++ compiler found ($(g++ --version 2>/dev/null | head -1 || clang++ --version 2>/dev/null | head -1))"

elif [ "$OS" = "linux" ]; then
    if ! command -v g++ &>/dev/null; then
        if [ "$HAS_SUDO" = true ]; then
            if command -v apt &>/dev/null; then
                sudo apt update -qq && sudo apt install -y -qq g++ 2>/dev/null
            elif command -v dnf &>/dev/null; then
                sudo dnf install -y gcc-c++ 2>/dev/null
            elif command -v pacman &>/dev/null; then
                sudo pacman -S --noconfirm gcc 2>/dev/null
            fi
        fi
    fi
    if ! command -v g++ &>/dev/null; then
        fail "g++ not found. Install it with: sudo apt install g++ (Ubuntu/Debian) or sudo dnf install gcc-c++ (Fedora)"
    fi
    success "g++ found"
fi

# ==============================================================
# Step 2: Python 3
# ==============================================================
echo ""
echo "Step 2/5: Checking Python..."

if ! command -v python3 &>/dev/null; then
    if [ "$OS" = "mac" ]; then
        if command -v brew &>/dev/null; then
            echo "  Installing Python 3 via Homebrew..."
            brew install python3
        else
            echo ""
            echo "  Python 3 is required but not installed."
            echo ""
            echo "  Easiest way to install on Mac:"
            echo "    1. Go to https://www.python.org/downloads/"
            echo "    2. Click the big yellow 'Download Python' button"
            echo "    3. Open the downloaded file and follow the installer"
            echo "    4. Re-run this script"
            echo ""
            fail "Python 3 not found. Please install it first."
        fi
    elif [ "$OS" = "linux" ] && [ "$HAS_SUDO" = true ]; then
        if command -v apt &>/dev/null; then
            sudo apt install -y -qq python3 python3-pip 2>/dev/null
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y python3 python3-pip 2>/dev/null
        elif command -v pacman &>/dev/null; then
            sudo pacman -S --noconfirm python python-pip 2>/dev/null
        fi
    fi
fi

if ! command -v python3 &>/dev/null; then
    fail "Python 3 not found. Please install Python 3 from https://www.python.org/downloads/"
fi
success "Python 3 found: $(python3 --version)"

# Install pip if needed
if ! command -v pip &>/dev/null && ! command -v pip3 &>/dev/null && ! python3 -m pip --version &>/dev/null 2>&1; then
    echo "  Installing pip..."
    curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
    python3 /tmp/get-pip.py --user --break-system-packages 2>/dev/null || \
    python3 /tmp/get-pip.py --user 2>/dev/null || \
    python3 /tmp/get-pip.py 2>/dev/null
    rm -f /tmp/get-pip.py
    export PATH="$HOME/.local/bin:$PATH"
fi

# Install yfinance
cd "$PROJECT_DIR"
echo "  Installing Python packages (yfinance)..."
pip install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null || \
pip install -r src/python/requirements.txt --user --quiet 2>/dev/null || \
pip install -r src/python/requirements.txt --quiet 2>/dev/null || \
pip3 install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null || \
pip3 install -r src/python/requirements.txt --user --quiet 2>/dev/null || \
python3 -m pip install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null || \
python3 -m pip install -r src/python/requirements.txt --user --quiet 2>/dev/null || \
python3 -m pip install -r src/python/requirements.txt --quiet 2>/dev/null
success "Python packages installed"

# ==============================================================
# Step 3: Java
# ==============================================================
echo ""
echo "Step 3/5: Setting up Java..."

install_java_local() {
    echo "  Installing JDK 17 to ~/.local/jdk ..."
    mkdir -p "$HOME/.local/jdk"

    if [ "$OS" = "mac" ]; then
        if [ "$ARCH" = "arm64" ]; then
            JDK_URL="https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
        else
            JDK_URL="https://api.adoptium.net/v3/binary/latest/17/ga/mac/x64/jdk/hotspot/normal/eclipse?project=jdk"
        fi
    else
        if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            JDK_URL="https://api.adoptium.net/v3/binary/latest/17/ga/linux/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
        else
            JDK_URL="https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk"
        fi
    fi

    curl -sL "$JDK_URL" -o /tmp/jdk.tar.gz
    tar xzf /tmp/jdk.tar.gz -C "$HOME/.local/jdk" --strip-components=1
    rm -f /tmp/jdk.tar.gz
    export PATH="$HOME/.local/jdk/bin:$PATH"
    # On macOS the JDK structure nests inside Contents/Home
    if [ "$OS" = "mac" ] && [ -d "$HOME/.local/jdk/Contents/Home/bin" ]; then
        rm -rf /tmp/jdk_move
        mv "$HOME/.local/jdk" /tmp/jdk_move
        mv /tmp/jdk_move/Contents/Home "$HOME/.local/jdk"
        rm -rf /tmp/jdk_move
        export PATH="$HOME/.local/jdk/bin:$PATH"
    fi
    success "JDK 17 installed to ~/.local/jdk"
}

if ! command -v javac &>/dev/null; then
    if [ -f "$HOME/.local/jdk/bin/javac" ]; then
        export PATH="$HOME/.local/jdk/bin:$PATH"
        success "Java found at ~/.local/jdk"
    else
        # Try system package manager first
        INSTALLED_JAVA=false
        if [ "$OS" = "mac" ] && command -v brew &>/dev/null; then
            echo "  Installing Java via Homebrew..."
            brew install openjdk@17 2>/dev/null && INSTALLED_JAVA=true
            if [ "$INSTALLED_JAVA" = true ]; then
                # Homebrew OpenJDK needs to be symlinked
                sudo ln -sfn "$(brew --prefix openjdk@17)/libexec/openjdk.jdk" /Library/Java/JavaVirtualMachines/openjdk-17.jdk 2>/dev/null || true
                export PATH="$(brew --prefix openjdk@17)/bin:$PATH"
            fi
        elif [ "$OS" = "linux" ] && [ "$HAS_SUDO" = true ]; then
            if command -v apt &>/dev/null; then
                sudo apt install -y -qq default-jdk 2>/dev/null && INSTALLED_JAVA=true
            elif command -v dnf &>/dev/null; then
                sudo dnf install -y java-17-openjdk-devel 2>/dev/null && INSTALLED_JAVA=true
            elif command -v pacman &>/dev/null; then
                sudo pacman -S --noconfirm jdk-openjdk 2>/dev/null && INSTALLED_JAVA=true
            fi
        fi

        # If package manager didn't work, install locally
        if ! command -v javac &>/dev/null; then
            install_java_local
        fi
    fi
else
    success "Java found: $(javac --version 2>&1 | head -1)"
fi

# Compile Java modules
echo "  Compiling Java modules..."
mkdir -p "$PROJECT_DIR/build/java"
if command -v javac &>/dev/null; then
    javac -d "$PROJECT_DIR/build/java" "$PROJECT_DIR/src/java/src/analyzer/"*.java
    success "Java modules compiled"
else
    warn "javac not found — Java interpretation features will be unavailable"
fi

# ==============================================================
# Step 4: Node.js + Electron
# ==============================================================
echo ""
echo "Step 4/5: Setting up Node.js & Electron..."

# Check if we're on WSL (Electron not needed — uses Windows browser)
IS_WSL=false
if grep -qi "microsoft" /proc/version 2>/dev/null; then
    IS_WSL=true
fi

if [ "$IS_WSL" = true ]; then
    success "WSL detected — Electron not needed (uses Windows browser)"
else
    if ! command -v node &>/dev/null; then
        if [ "$OS" = "mac" ] && command -v brew &>/dev/null; then
            echo "  Installing Node.js via Homebrew..."
            brew install node 2>/dev/null
        elif [ "$OS" = "linux" ]; then
            echo "  Installing Node.js to ~/.local/node ..."
            mkdir -p "$HOME/.local/node"
            if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
                NODE_URL="https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-arm64.tar.xz"
            else
                NODE_URL="https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-x64.tar.xz"
            fi
            curl -sL "$NODE_URL" -o /tmp/node.tar.xz
            tar xJf /tmp/node.tar.xz -C "$HOME/.local/node" --strip-components=1
            rm -f /tmp/node.tar.xz
            export PATH="$HOME/.local/node/bin:$PATH"
        fi
    fi

    if command -v node &>/dev/null; then
        success "Node.js found: $(node --version)"
        echo "  Installing Electron..."
        cd "$PROJECT_DIR/src/electron"
        npm install --silent 2>/dev/null
        success "Electron installed"
    else
        warn "Node.js not found — app will run in browser mode (headless). Install from https://nodejs.org"
    fi
fi

# ==============================================================
# Step 5: Build C++ backend
# ==============================================================
echo ""
echo "Step 5/5: Building the application..."

cd "$PROJECT_DIR"
make clean 2>/dev/null || true
make 2>&1

if [ -f build/stock_analyzer ]; then
    success "Application built successfully"
else
    fail "Build failed. Check the output above for errors."
fi

# ==============================================================
# Verify everything
# ==============================================================
echo ""
echo "Verifying installation..."

ALL_GOOD=true

[ -f build/stock_analyzer ] && success "C++ backend: OK" || { warn "C++ backend: MISSING"; ALL_GOOD=false; }
python3 -c "import yfinance" 2>/dev/null && success "Python (yfinance): OK" || { warn "Python (yfinance): MISSING"; ALL_GOOD=false; }
[ -f build/java/analyzer/Interpreter.class ] && success "Java interpreter: OK" || { warn "Java interpreter: MISSING"; ALL_GOOD=false; }
[ -f build/frontend/index.html ] && success "Frontend files: OK" || { warn "Frontend files: MISSING"; ALL_GOOD=false; }

echo ""
if [ "$ALL_GOOD" = true ]; then
    echo "========================================"
    echo -e "  ${GREEN}Setup complete!${NC}"
    echo "========================================"
    echo ""
    echo "  To launch the app:"
    echo "    ./scripts/run.sh"
    echo ""
    echo "  Or in headless mode (opens in your browser):"
    echo "    ./scripts/run.sh --headless"
    echo "    Then open http://localhost:8089"
    echo ""
else
    echo "========================================"
    echo -e "  ${YELLOW}Setup completed with warnings.${NC}"
    echo "  Some features may be unavailable."
    echo "  Run this script again after installing"
    echo "  the missing items listed above."
    echo "========================================"
fi
