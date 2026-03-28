#!/bin/bash
# Stock Analyzer — Launch script
# Starts the C++ backend + opens the Electron desktop window

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
    if command -v javac &> /dev/null; then
        echo "Compiling Java modules..."
        mkdir -p "$PROJECT_DIR/build/java"
        javac -d "$PROJECT_DIR/build/java" "$PROJECT_DIR/src/java/src/analyzer/"*.java 2>/dev/null
    fi
fi

# ---- Ensure assets are current ----
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

# ---- Launch with Electron (default) ----
if [ -f "$PROJECT_DIR/src/electron/node_modules/electron/dist/electron" ]; then
    echo "Starting Stock Analyzer..."
    cd "$PROJECT_DIR/src/electron"
    exec npx electron . --no-sandbox 2>/dev/null
else
    # Fallback: install Electron if missing, then launch
    if command -v npm &> /dev/null; then
        echo "Installing Electron (first run)..."
        cd "$PROJECT_DIR/src/electron"
        npm install --silent 2>/dev/null
        echo "Starting Stock Analyzer..."
        exec npx electron . 2>/dev/null
    else
        # No Node.js — fall back to headless + browser
        echo "Node.js not found. Running in headless mode."
        echo "Install Node.js for the desktop window, or open http://localhost:8089"
        cd "$PROJECT_DIR/build"
        exec ./stock_analyzer --headless
    fi
fi
