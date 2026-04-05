"""
SQLAlchemy ORM models — SQLite for local/desktop, PostgreSQL for production.
Swap database by changing DATABASE_URL env var.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    api_key = Column(String, unique=True, nullable=False)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())


class Watchlist(Base):
    __tablename__ = "watchlist"

    user_id = Column(String, primary_key=True)
    symbol = Column(String, primary_key=True, nullable=False)
    added_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())


class PriceData(Base):
    __tablename__ = "price_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    time = Column(String, nullable=False)
    symbol = Column(String, nullable=False, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)

    __table_args__ = (Index("idx_price_time_symbol", "time", "symbol"),)


class SentimentRecord(Base):
    __tablename__ = "sentiment_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False, index=True)
    source = Column(String, nullable=False)  # "news", "reddit"
    text = Column(Text)
    score = Column(Float)  # -1.0 to 1.0
    label = Column(String)  # "positive", "negative", "neutral"
    confidence = Column(Float)
    recorded_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())


class AnomalyRecord(Base):
    __tablename__ = "anomaly_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False, index=True)
    anomaly_score = Column(Float, nullable=False)
    anomaly_flag = Column(Integer, default=0)  # SQLite has no bool
    price_change_pct = Column(Float)
    volume_ratio = Column(Float)
    detected_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
