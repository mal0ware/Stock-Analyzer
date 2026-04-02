FROM python:3.13-slim

WORKDIR /app

# Install Python dependencies
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy API code
COPY api/ ./api/

# Copy frontend for static file serving
COPY src/frontend/ ./src/frontend/

EXPOSE 8080

ENV PORT=8080
ENV CORS_ORIGINS="*"
ENV RATE_LIMIT=60

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "api"]
