#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "=== Building frontend ==="
cd frontend
npm install --silent
npm run build
cd ..

echo ""
echo "=== Installing Python dependencies ==="
pip install -q -r api/requirements.txt

echo ""
echo "=== Starting server on http://localhost:8080 ==="
python -m uvicorn api.main:app --host 0.0.0.0 --port 8080
