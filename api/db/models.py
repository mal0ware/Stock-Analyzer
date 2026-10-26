"""
SQLAlchemy ORM models — SQLite for local/desktop, PostgreSQL for production.
Swap database by changing DATABASE_URL env var.

Columns use the typed ``Mapped[...] = mapped_column(...)`` form. SQLAlchemy 2.1
types bare ``Column(...)`` class attributes as ``Never`` for type checkers, so
the legacy form makes every query on these models look unreachable to mypy.
Nullability follows the annotation: ``X | None`` columns allow NULL.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Float,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    api_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[str | None] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )


class Watchlist(Base):
    __tablename__ = "watchlist"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    symbol: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    added_at: Mapped[str | None] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )


class PriceData(Base):
    __tablename__ = "price_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    time: Mapped[str] = mapped_column(String, nullable=False)
    symbol: Mapped[str] = mapped_column(String, nullable=False, index=True)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (Index("idx_price_time_symbol", "time", "symbol"),)


class SentimentRecord(Base):
    __tablename__ = "sentiment_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String, nullable=False)  # "news", "reddit"
    text: Mapped[str | None] = mapped_column(Text)
    score: Mapped[float | None] = mapped_column(Float)  # -1.0 to 1.0
    label: Mapped[str | None] = mapped_column(String)  # "positive", "negative", "neutral"
    confidence: Mapped[float | None] = mapped_column(Float)
    recorded_at: Mapped[str | None] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )


class AnomalyRecord(Base):
    __tablename__ = "anomaly_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String, nullable=False, index=True)
    anomaly_score: Mapped[float] = mapped_column(Float, nullable=False)
    anomaly_flag: Mapped[int | None] = mapped_column(Integer, default=0)  # SQLite has no bool
    price_change_pct: Mapped[float | None] = mapped_column(Float)
    volume_ratio: Mapped[float | None] = mapped_column(Float)
    detected_at: Mapped[str | None] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )
