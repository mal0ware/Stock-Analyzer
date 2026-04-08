#!/usr/bin/env bash
# AI Market Analyst — Quick start
# Builds frontend + starts the FastAPI server on port 8080
set -e

cd "$(dirname "$0")"

# Build frontend if not already built
if [ ! -f frontend/dist/index.html ]; then
    echo "=== Building frontend ==="
    cd frontend
    npm install --silent 2>/dev/null
    npm run build
    cd ..
    echo ""
fi

# Install Python deps if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "=== Installing Python dependencies ==="
    pip install -q -r api/requirements.txt
    echo ""
fi

echo "=== Starting AI Market Analyst on http://localhost:8080 ==="
python3 -m uvicorn main:app --host 0.0.0.0 --port 8080 --app-dir api
