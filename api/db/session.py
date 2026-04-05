"""
Database session management.
SQLite for local dev / desktop app, PostgreSQL for production web.
Swap by changing DATABASE_URL env var.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./market_analyst.db")

# SQLite needs check_same_thread=False for FastAPI async
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency — yields a DB session, closes on finish."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
