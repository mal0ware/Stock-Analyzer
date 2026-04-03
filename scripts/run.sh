#!/bin/bash
# Stock Analyzer — Launch script
# Starts the C++ backend + opens the desktop window
# On WSL2: opens a native Windows app window (Edge/Chrome --app mode)
# On Linux: uses Electron

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure local tools are on PATH
export PATH="$HOME/.local/node/bin:$HOME/.local/jdk/bin:$HOME/.local/bin:$PATH"

# Must unset this or Electron runs as plain Node instead of a desktop app
unset ELECTRON_RUN_AS_NODE

# ---- Check if built ----
if [ ! -f "$PROJECT_DIR/build/stock_analyzer" ]; then
    echo "Application not built yet. Running setup first..."
    bash "$SCRIPT_DIR/setup.sh"
fi

# ---- Ensure Java classes exist ----
if [ ! -f "$PROJECT_DIR/build/java/analyzer/Interpreter.class" ]; then
    JAVAC=""
    if command -v javac &>/dev/null; then
        JAVAC="javac"
    elif [ -f "$HOME/.local/jdk/bin/javac" ]; then
        JAVAC="$HOME/.local/jdk/bin/javac"
    fi
    if [ -n "$JAVAC" ]; then
        echo "Compiling Java modules..."
        mkdir -p "$PROJECT_DIR/build/java"
        "$JAVAC" -d "$PROJECT_DIR/build/java" "$PROJECT_DIR/src/java/src/analyzer/"*.java 2>/dev/null
    fi
fi

# ---- Ensure assets are current ----
rm -rf "$PROJECT_DIR/build/frontend" "$PROJECT_DIR/build/python"
cp -r "$PROJECT_DIR/src/frontend" "$PROJECT_DIR/build/frontend" 2>/dev/null
cp -r "$PROJECT_DIR/src/python" "$PROJECT_DIR/build/python" 2>/dev/null

# ---- Check for --headless flag ----
for arg in "$@"; do
    if [ "$arg" = "--headless" ] || [ "$arg" = "-H" ]; then
        echo "Starting in headless mode..."
        cd "$PROJECT_DIR/build"
        exec ./stock_analyzer --headless
    fi
done

# ---- Detect WSL ----
IS_WSL=false
if grep -qi "microsoft" /proc/version 2>/dev/null; then
    IS_WSL=true
fi

# ---- Helper: launch a Windows browser window in app mode ----
# Sets BROWSER_PID to the launched process so we can detect when it closes.
BROWSER_PID=""
launch_windows_window() {
    local url="$1"
    local EDGE1="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    local EDGE2="/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"
    local CHROME1="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
    local CHROME2="/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"

    for browser in "$EDGE1" "$EDGE2" "$CHROME1" "$CHROME2"; do
        if [ -f "$browser" ]; then
            "$browser" "--app=$url" "--window-size=1320,880" &>/dev/null &
            BROWSER_PID=$!
            return 0
        fi
    done

    # Fallback: use PowerShell to start Edge in app mode
    if command -v powershell.exe &>/dev/null; then
        powershell.exe -Command "Start-Process 'msedge' '--app=$url --window-size=1320,880'" &>/dev/null &
        BROWSER_PID=$!
        return 0
    fi

    # Last resort: open in default browser (will open as a tab)
    cmd.exe /c start "$url" &>/dev/null
    echo "Note: opened in browser tab. For a standalone window, install Microsoft Edge."
}

# ---- WSL mode: backend in WSL, window on Windows ----
if $IS_WSL; then
    echo "WSL detected — launching Stock Analyzer as a Windows application."

    # Start C++ backend (suppress its output — script handles messaging)
    cd "$PROJECT_DIR/build"
    ./stock_analyzer --headless &>/dev/null &
    BACKEND_PID=$!

    # Wait up to 10 seconds for backend to be ready
    for i in $(seq 1 40); do
        if (echo > /dev/tcp/localhost/8089) 2>/dev/null; then
            break
        fi
        if ! kill -0 $BACKEND_PID 2>/dev/null; then
            echo "Backend crashed on startup. Check your build."
            exit 1
        fi
        sleep 0.25
    done

    launch_windows_window "http://localhost:8089"
    echo "Stock Analyzer is running at http://localhost:8089"
    echo "Press Ctrl+C to stop."

    # Shut down backend when the script exits
    cleanup() {
        echo ""
        echo "Shutting down..."
        kill $BACKEND_PID 2>/dev/null
        wait $BACKEND_PID 2>/dev/null
        exit 0
    }
    trap cleanup INT TERM

    # On WSL, browser PIDs are interop shims that exit immediately —
    # tracking them would kill the backend while the window is still open.
    # Instead, keep the backend alive until the user presses Ctrl+C.
    wait $BACKEND_PID
    exit 0
fi

# ---- Native desktop mode (Linux / macOS): use Electron ----
ELECTRON_BIN=""
if [ -f "$PROJECT_DIR/src/electron/node_modules/electron/dist/electron" ]; then
    ELECTRON_BIN="$PROJECT_DIR/src/electron/node_modules/electron/dist/electron"
elif [ -f "$PROJECT_DIR/src/electron/node_modules/.bin/electron" ]; then
    ELECTRON_BIN="$PROJECT_DIR/src/electron/node_modules/.bin/electron"
elif [ -d "$PROJECT_DIR/src/electron/node_modules/electron/dist/Electron.app" ]; then
    # macOS Electron path
    ELECTRON_BIN="$PROJECT_DIR/src/electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
fi

if [ -n "$ELECTRON_BIN" ]; then
    echo "Starting Stock Analyzer..."
    cd "$PROJECT_DIR/src/electron"
    exec "$ELECTRON_BIN" . --no-sandbox 2>/dev/null
else
    if command -v npm &> /dev/null; then
        echo "Installing Electron (first run)..."
        cd "$PROJECT_DIR/src/electron"
        npm install --silent 2>/dev/null
        echo "Starting Stock Analyzer..."
        exec npx electron . --no-sandbox 2>/dev/null
    else
        # Fallback: headless mode with system browser
        echo "Electron not available. Starting in browser mode..."
        cd "$PROJECT_DIR/build"
        ./stock_analyzer --headless &
        BACKEND_PID=$!

        for i in $(seq 1 40); do
            if (echo > /dev/tcp/localhost/8089) 2>/dev/null; then
                break
            fi
            sleep 0.25
        done

        # Open in default browser
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open "http://localhost:8089"
        elif command -v xdg-open &>/dev/null; then
            xdg-open "http://localhost:8089"
        fi

        echo "Stock Analyzer is running at http://localhost:8089"
        echo "Press Ctrl+C to stop."
        trap "echo ''; echo 'Shutting down...'; kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM
        wait $BACKEND_PID
    fi
fi
