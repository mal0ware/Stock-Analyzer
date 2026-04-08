# Stage 1: Build React frontend
FROM node:22-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline 2>/dev/null || npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production image — Python only, no Node runtime needed
FROM python:3.13-slim
WORKDIR /app

# System deps (curl for healthcheck only)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps (cached layer — only rebuilds when requirements change)
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ml/ ./ml/
COPY api/ ./api/

# Copy React build output — served by FastAPI at /
COPY --from=frontend-build /build/dist/ ./frontend-dist/

EXPOSE 8080

ENV PORT=8080 \
    CORS_ORIGINS="*" \
    RATE_LIMIT=120 \
    DATABASE_URL="sqlite:///./market_analyst.db" \
    PYTHONUNBUFFERED=1

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--app-dir", "api"]
