FROM node:22-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app

# Install system deps for health check
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ML pipeline
COPY ml/ ./ml/

# Copy API code
COPY api/ ./api/

# Copy v1 vanilla JS frontend (legacy)
COPY src/frontend/ ./src/frontend/

# Copy v2 React dashboard build output
COPY --from=frontend-build /build/dist/ ./frontend-dist/

EXPOSE 8080

ENV PORT=8080
ENV CORS_ORIGINS="*"
ENV RATE_LIMIT=60
ENV DATABASE_URL="sqlite:///./market_analyst.db"

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "api"]
