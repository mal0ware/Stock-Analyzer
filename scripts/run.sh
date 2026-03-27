#!/bin/bash
# Stock Analyzer — Launch script
# Builds if needed, then runs the application

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure local tools are on PATH (user-installed JDK, pip packages)
export PATH="$HOME/.local/jdk/bin:$HOME/.local/bin:$PATH"

# Check if built
if [ ! -f "$PROJECT_DIR/build/stock_analyzer" ]; then
    echo "Application not built yet. Running setup first..."
    echo ""
    bash "$SCRIPT_DIR/setup.sh"
    echo ""
fi

# Check if Java classes exist, compile if needed
if [ ! -f "$PROJECT_DIR/build/java/analyzer/Interpreter.class" ]; then
    if command -v javac &> /dev/null; then
        echo "Compiling Java modules..."
        mkdir -p "$PROJECT_DIR/build/java"
        javac -d "$PROJECT_DIR/build/java" "$PROJECT_DIR/src/java/src/analyzer/"*.java 2>/dev/null
    fi
fi

# Ensure frontend and python files are up to date
cp -r "$PROJECT_DIR/src/frontend" "$PROJECT_DIR/build/frontend" 2>/dev/null
cp -r "$PROJECT_DIR/src/python" "$PROJECT_DIR/build/python" 2>/dev/null

# Run
echo "Starting Stock Analyzer..."
cd "$PROJECT_DIR/build"
exec ./stock_analyzer "$@"
