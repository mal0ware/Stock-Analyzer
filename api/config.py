"""
Centralized configuration for the Stock Analyzer API.
"""

import os
import re

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./market_analyst.db")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8089,http://localhost:5173").split(",")

RATE_LIMIT = int(os.getenv("RATE_LIMIT", "60"))
RATE_WINDOW = 60

# Input validation patterns (carried from v1)
SYMBOL_PATTERN = re.compile(r"^[A-Za-z0-9.\-]{1,10}$")
VALID_PERIODS = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"}

# Endpoint-specific cache TTLs (progressive caching from v1, extended for v2)
CACHE_TTLS = {
    "snapshot": 15,
    "history_short": 60,
    "history_long": 300,
    "sentiment": 120,
    "anomalies": 30,
    "market_overview": 60,
    "quote": 30,
    "analysis": 120,
    "interpret": 60,
    "search": 300,
    "news": 300,
    "glossary": 3600,
}
