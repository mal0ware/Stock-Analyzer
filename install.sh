#!/usr/bin/env bash
# Stock Analyzer — One-command installer
# Usage: curl -fsSL https://raw.githubusercontent.com/mal0ware/Stock-Analyzer/main/install.sh | bash
#
# Installs dependencies, builds the frontend, and launches the app.
# Works on Linux, macOS, and WSL2.

set -e

GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
NC=$'\033[0m'

info()    { echo "  ${GREEN}+${NC} $1"; }
warn()    { echo "  ${YELLOW}!${NC} $1"; }
header()  { echo ""; echo "  ${BOLD}$1${NC}"; }

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

echo ""
echo "  ${BOLD}Stock Analyzer — Installer${NC}"
echo "  ${DIM}Desktop stock analysis with real-time data and ML insights${NC}"
echo ""

# Detect platform
IS_WSL=false
if grep -qi "microsoft" /proc/version 2>/dev/null; then
    IS_WSL=true
    info "WSL2 detected"
fi

INSTALL_DIR="$HOME/stock-analyzer"

# ---------------------------------------------------------------------------
# Clone or update
# ---------------------------------------------------------------------------
header "[1/4] Getting source code"

if [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull --quiet origin main 2>/dev/null || true
else
    progress "Cloning repository..." git clone --depth 1 https://github.com/mal0ware/Stock-Analyzer.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ---------------------------------------------------------------------------
# Python
# ---------------------------------------------------------------------------
header "[2/4] Setting up Python"

if ! command -v python3 &>/dev/null; then
    warn "Python 3 not found — installing..."
    if command -v apt &>/dev/null; then
        sudo apt update -qq && sudo apt install -y -qq python3 python3-pip python3-venv
    elif command -v brew &>/dev/null; then
        brew install python3
    else
        echo "  Please install Python 3 from https://www.python.org/downloads/"
        exit 1
    fi
fi
info "Python $(python3 --version | cut -d' ' -f2)"

# Create venv if needed
if [ ! -d "$INSTALL_DIR/venv" ]; then
    progress "Creating virtual environment..." python3 -m venv "$INSTALL_DIR/venv"
fi

source "$INSTALL_DIR/venv/bin/activate"
progress "Installing Python packages..." pip install --quiet -r api/requirements.txt

# ---------------------------------------------------------------------------
# Node.js + Frontend build
# ---------------------------------------------------------------------------
header "[3/4] Building frontend"

if ! command -v node &>/dev/null; then
    info "Installing Node.js..."
    ARCH="$(uname -m)"
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        NODE_URL="https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-arm64.tar.xz"
    else
        NODE_URL="https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz"
    fi
    mkdir -p "$HOME/.local/node"
    progress "Downloading Node.js..." bash -c "curl -sL '$NODE_URL' -o /tmp/node.tar.xz && tar xJf /tmp/node.tar.xz -C '$HOME/.local/node' --strip-components=1 && rm -f /tmp/node.tar.xz"
    export PATH="$HOME/.local/node/bin:$PATH"
fi
info "Node $(node --version)"

cd "$INSTALL_DIR/frontend"
progress "Installing frontend deps..." npm install --silent 2>/dev/null
progress "Building React dashboard..." npm run build
cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# Create launcher script
# ---------------------------------------------------------------------------
header "[4/4] Creating launcher"

LAUNCHER="$INSTALL_DIR/launch.sh"
cat > "$LAUNCHER" << 'LAUNCH_EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
source venv/bin/activate

GREEN=$'\033[0;32m'
BOLD=$'\033[1m'
NC=$'\033[0m'

echo ""
echo "  ${BOLD}Stock Analyzer${NC}"
echo "  Starting server..."
echo ""

# Start backend
python -m uvicorn main:app --host 0.0.0.0 --port 8080 --app-dir api &
SERVER_PID=$!

# Wait for server
for i in $(seq 1 30); do
    if curl -sf http://localhost:8080/api/health > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

echo "  ${GREEN}Ready!${NC} Open ${BOLD}http://localhost:8080${NC} in your browser"
echo "  Press Ctrl+C to stop"
echo ""

# On WSL, open in Windows browser automatically
if grep -qi "microsoft" /proc/version 2>/dev/null; then
    EDGE="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    EDGE2="/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"
    CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
    for browser in "$EDGE" "$EDGE2" "$CHROME"; do
        if [ -f "$browser" ]; then
            "$browser" "http://localhost:8080" &>/dev/null &
            break
        fi
    done
fi

cleanup() {
    echo ""
    echo "  Shutting down..."
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM

wait $SERVER_PID
LAUNCH_EOF
chmod +x "$LAUNCHER"

# Create desktop entry on Linux
if [ "$IS_WSL" = false ] && [ -d "$HOME/.local/share/applications" ]; then
    cat > "$HOME/.local/share/applications/stock-analyzer.desktop" << EOF
[Desktop Entry]
Name=Stock Analyzer
Comment=Desktop stock analysis with real-time data and ML insights
Exec=bash $LAUNCHER
Terminal=true
Type=Application
Categories=Finance;Development;
EOF
    info "Desktop shortcut created"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "  ${GREEN}${BOLD}Installation complete!${NC}"
echo ""
echo "  To launch:"
echo "    ${BOLD}$LAUNCHER${NC}"
echo ""
echo "  Or from anywhere:"
echo "    ${BOLD}cd $INSTALL_DIR && bash launch.sh${NC}"
echo ""
if $IS_WSL; then
    echo "  ${DIM}On WSL, the app will open in your Windows browser automatically.${NC}"
    echo ""
fi
