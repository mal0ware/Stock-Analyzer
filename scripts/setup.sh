#!/bin/bash
# Stock Analyzer — One-time setup script
# Installs all dependencies and builds the application
# Works on macOS, Linux, and WSL2

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors (ANSI-C quoting — stores actual ESC byte, works in echo and printf)
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
NC=$'\033[0m'

success() { echo "  ${GREEN}✓${NC} $1"; }
warn()    { echo "  ${YELLOW}⚠${NC} $1"; }
fail()    { echo "  ${RED}✗${NC} $1"; exit 1; }

# ---- Progress bar helper ----
# Runs a command in the background with an animated progress bar.
# The bar fills asymptotically to ~92%, then snaps to 100% on completion.
# Usage: progress "Installing packages" command [args...]
BAR_WIDTH=30

draw_bar() {
    local msg="$1" pct=$2
    local filled=$((pct * BAR_WIDTH / 100))
    local empty=$((BAR_WIDTH - filled))
    local bar_f="" bar_e=""
    for ((j=0; j<filled; j++)); do bar_f+="█"; done
    for ((j=0; j<empty;  j++)); do bar_e+="░"; done
    printf "\r  %-28s ${GREEN}%s${DIM}%s${NC} %3d%%" "$msg" "$bar_f" "$bar_e" "$pct"
}

progress() {
    local msg="$1"; shift
    "$@" &>/dev/null &
    local pid=$! pct=0

    while kill -0 "$pid" 2>/dev/null; do
        local incr=$(( (92 - pct) / 12 ))
        [ $incr -lt 1 ] && incr=1
        pct=$(( pct + incr ))
        [ $pct -gt 92 ] && pct=92
        draw_bar "$msg" $pct
        sleep 0.12
    done
    wait "$pid"
    local rc=$?
    draw_bar "$msg" 100
    echo ""
    return $rc
}

# Show step header
step() {
    echo ""
    echo "  ${BOLD}[$1/5]${NC} $2"
}

# ---- Header ----
echo ""
echo "${BOLD}  Stock Analyzer — Setup${NC}"

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

echo "  ${DIM}Platform: $OS ($ARCH)${NC}"

HAS_SUDO=false
if [ "$OS" != "mac" ] && sudo -n true 2>/dev/null; then
    HAS_SUDO=true
fi

export PATH="$HOME/.local/bin:$HOME/.local/jdk/bin:$HOME/.local/node/bin:$PATH"

# ==============================================================
# Step 1: C++ compiler
# ==============================================================
step 1 "C++ compiler"

if [ "$OS" = "mac" ]; then
    if ! command -v g++ &>/dev/null && ! command -v clang++ &>/dev/null; then
        xcode-select --install 2>/dev/null || true
        echo ""
        echo "  ┌─────────────────────────────────────────────────┐"
        echo "  │  A popup may have appeared asking to install     │"
        echo "  │  developer tools. Click 'Install' and wait for  │"
        echo "  │  it to finish, then run this script again.       │"
        echo "  └─────────────────────────────────────────────────┘"
        fail "Please install Xcode Command Line Tools first, then re-run this script."
    fi
    success "Found ($(g++ --version 2>/dev/null | head -1 || clang++ --version 2>/dev/null | head -1))"

elif [ "$OS" = "linux" ]; then
    if ! command -v g++ &>/dev/null; then
        if [ "$HAS_SUDO" = true ]; then
            if command -v apt &>/dev/null; then
                progress "Installing g++..." bash -c 'sudo apt update -qq && sudo apt install -y -qq g++ 2>/dev/null'
            elif command -v dnf &>/dev/null; then
                progress "Installing g++..." sudo dnf install -y gcc-c++
            elif command -v pacman &>/dev/null; then
                progress "Installing g++..." sudo pacman -S --noconfirm gcc
            fi
        fi
    fi
    if ! command -v g++ &>/dev/null; then
        fail "g++ not found. Install with: sudo apt install g++ (Ubuntu) or sudo dnf install gcc-c++ (Fedora)"
    fi
    success "g++ found"
fi

# ==============================================================
# Step 2: Python 3
# ==============================================================
step 2 "Python"

if ! command -v python3 &>/dev/null; then
    if [ "$OS" = "mac" ]; then
        if command -v brew &>/dev/null; then
            progress "Installing Python 3..." brew install python3
        else
            echo "  Python 3 is required but not installed."
            echo "    1. Go to https://www.python.org/downloads/"
            echo "    2. Download and run the installer"
            echo "    3. Re-run this script"
            fail "Python 3 not found."
        fi
    elif [ "$OS" = "linux" ] && [ "$HAS_SUDO" = true ]; then
        if command -v apt &>/dev/null; then
            progress "Installing Python 3..." sudo apt install -y -qq python3 python3-pip
        elif command -v dnf &>/dev/null; then
            progress "Installing Python 3..." sudo dnf install -y python3 python3-pip
        elif command -v pacman &>/dev/null; then
            progress "Installing Python 3..." sudo pacman -S --noconfirm python python-pip
        fi
    fi
fi

if ! command -v python3 &>/dev/null; then
    fail "Python 3 not found. Install from https://www.python.org/downloads/"
fi
success "Python 3: $(python3 --version)"

# Install pip if needed
if ! command -v pip &>/dev/null && ! command -v pip3 &>/dev/null && ! python3 -m pip --version &>/dev/null 2>&1; then
    progress "Installing pip..." bash -c '
        curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
        python3 /tmp/get-pip.py --user --break-system-packages 2>/dev/null ||
        python3 /tmp/get-pip.py --user 2>/dev/null ||
        python3 /tmp/get-pip.py 2>/dev/null
        rm -f /tmp/get-pip.py
    '
    export PATH="$HOME/.local/bin:$PATH"
fi

cd "$PROJECT_DIR"
progress "Installing Python packages..." bash -c '
    pip install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null ||
    pip install -r src/python/requirements.txt --user --quiet 2>/dev/null ||
    pip install -r src/python/requirements.txt --quiet 2>/dev/null ||
    pip3 install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null ||
    pip3 install -r src/python/requirements.txt --user --quiet 2>/dev/null ||
    python3 -m pip install -r src/python/requirements.txt --user --break-system-packages --quiet 2>/dev/null ||
    python3 -m pip install -r src/python/requirements.txt --user --quiet 2>/dev/null ||
    python3 -m pip install -r src/python/requirements.txt --quiet 2>/dev/null
'
success "Python packages installed"

# ==============================================================
# Step 3: Java
# ==============================================================
step 3 "Java"

install_java_local() {
    mkdir -p "$HOME/.local/jdk"

    if [ "$OS" = "mac" ]; then
        if [ "$ARCH" = "arm64" ]; then
            JDK_URL="https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
        else
            JDK_URL="https://api.adoptium.net/v3/binary/latest/21/ga/mac/x64/jdk/hotspot/normal/eclipse?project=jdk"
        fi
    else
        if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            JDK_URL="https://api.adoptium.net/v3/binary/latest/21/ga/linux/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
        else
            JDK_URL="https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk"
        fi
    fi

    curl -sL "$JDK_URL" -o /tmp/jdk.tar.gz
    tar xzf /tmp/jdk.tar.gz -C "$HOME/.local/jdk" --strip-components=1
    rm -f /tmp/jdk.tar.gz
    export PATH="$HOME/.local/jdk/bin:$PATH"
    if [ "$OS" = "mac" ] && [ -d "$HOME/.local/jdk/Contents/Home/bin" ]; then
        rm -rf /tmp/jdk_move
        mv "$HOME/.local/jdk" /tmp/jdk_move
        mv /tmp/jdk_move/Contents/Home "$HOME/.local/jdk"
        rm -rf /tmp/jdk_move
        export PATH="$HOME/.local/jdk/bin:$PATH"
    fi
}

if ! command -v javac &>/dev/null; then
    if [ -f "$HOME/.local/jdk/bin/javac" ]; then
        export PATH="$HOME/.local/jdk/bin:$PATH"
        success "Found at ~/.local/jdk"
    else
        INSTALLED_JAVA=false
        if [ "$OS" = "mac" ] && command -v brew &>/dev/null; then
            progress "Installing Java via Homebrew..." bash -c 'brew install openjdk@21 2>/dev/null' && INSTALLED_JAVA=true
            if [ "$INSTALLED_JAVA" = true ]; then
                sudo ln -sfn "$(brew --prefix openjdk@21)/libexec/openjdk.jdk" /Library/Java/JavaVirtualMachines/openjdk-21.jdk 2>/dev/null || true
                export PATH="$(brew --prefix openjdk@21)/bin:$PATH"
            fi
        elif [ "$OS" = "linux" ] && [ "$HAS_SUDO" = true ]; then
            if command -v apt &>/dev/null; then
                progress "Installing Java..." sudo apt install -y -qq default-jdk && INSTALLED_JAVA=true
            elif command -v dnf &>/dev/null; then
                progress "Installing Java..." sudo dnf install -y java-21-openjdk-devel && INSTALLED_JAVA=true
            elif command -v pacman &>/dev/null; then
                progress "Installing Java..." sudo pacman -S --noconfirm jdk-openjdk && INSTALLED_JAVA=true
            fi
        fi

        if ! command -v javac &>/dev/null; then
            progress "Downloading JDK 21..." install_java_local
        fi
    fi
else
    success "Found: $(javac --version 2>&1 | head -1)"
fi

JAVAC=""
if command -v javac &>/dev/null; then
    JAVAC="$(command -v javac)"
elif [ -f "$HOME/.local/jdk/bin/javac" ]; then
    JAVAC="$HOME/.local/jdk/bin/javac"
    export PATH="$HOME/.local/jdk/bin:$PATH"
fi

if [ -n "$JAVAC" ]; then
    success "Java compiler: $($JAVAC --version 2>&1 | head -1)"
else
    warn "javac not found — Java features will be unavailable"
fi

# ==============================================================
# Step 4: Node.js + Electron
# ==============================================================
step 4 "Node.js & Electron"

IS_WSL=false
if grep -qi "microsoft" /proc/version 2>/dev/null; then
    IS_WSL=true
fi

if [ "$IS_WSL" = true ]; then
    success "WSL detected — Electron not needed (uses Windows browser)"
else
    if ! command -v node &>/dev/null; then
        if [ "$OS" = "mac" ] && command -v brew &>/dev/null; then
            progress "Installing Node.js..." brew install node
        elif [ "$OS" = "linux" ]; then
            mkdir -p "$HOME/.local/node"
            if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
                NODE_URL="https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-arm64.tar.xz"
            else
                NODE_URL="https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-x64.tar.xz"
            fi
            progress "Downloading Node.js..." bash -c "curl -sL '$NODE_URL' -o /tmp/node.tar.xz && tar xJf /tmp/node.tar.xz -C '$HOME/.local/node' --strip-components=1 && rm -f /tmp/node.tar.xz"
            export PATH="$HOME/.local/node/bin:$PATH"
        fi
    fi

    if command -v node &>/dev/null; then
        success "Node.js: $(node --version)"
        cd "$PROJECT_DIR/src/electron"
        progress "Installing Electron..." npm install --silent
        success "Electron installed"
    else
        warn "Node.js not found — app will run in browser mode. Install from https://nodejs.org"
    fi
fi

# ==============================================================
# Step 5: Build
# ==============================================================
step 5 "Build"

cd "$PROJECT_DIR"
make clean 2>/dev/null || true

progress "Compiling C++ backend..." make
if [ ! -f build/stock_analyzer ]; then
    fail "Build failed."
fi
success "C++ backend compiled"

if [ -n "$JAVAC" ]; then
    mkdir -p "$PROJECT_DIR/build/java"
    progress "Compiling Java modules..." "$JAVAC" -d "$PROJECT_DIR/build/java" "$PROJECT_DIR/src/java/src/analyzer/"*.java
    success "Java modules compiled"
fi

# ==============================================================
# Verify
# ==============================================================
echo ""
ALL_GOOD=true
[ -f build/stock_analyzer ]                       && success "C++ backend: OK"      || { warn "C++ backend: MISSING";      ALL_GOOD=false; }
python3 -c "import yfinance" 2>/dev/null          && success "Python (yfinance): OK" || { warn "Python (yfinance): MISSING"; ALL_GOOD=false; }
[ -f build/java/analyzer/Interpreter.class ]      && success "Java interpreter: OK"  || { warn "Java interpreter: MISSING";  ALL_GOOD=false; }
[ -f build/frontend/index.html ]                  && success "Frontend files: OK"    || { warn "Frontend files: MISSING";    ALL_GOOD=false; }

echo ""
if [ "$ALL_GOOD" = true ]; then
    echo "  ${GREEN}Setup complete!${NC} Run ${BOLD}./scripts/run.sh${NC} to launch."
else
    echo "  ${YELLOW}Setup completed with warnings.${NC} Some features may be unavailable."
    echo "  Run this script again after installing the missing items above."
fi
echo ""
