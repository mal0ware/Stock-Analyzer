"""
Base data source abstraction.
Each source implements connect/fetch with its own retry logic.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import AsyncIterator

from pydantic import BaseModel


class MarketDataPoint(BaseModel):
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    source: str


class SentimentDataPoint(BaseModel):
    symbol: str
    text: str
    score: float  # -1.0 to 1.0
    label: str  # positive / negative / neutral
    confidence: float
    source: str  # news / reddit
    timestamp: datetime


class DataSource(ABC):
    """Base class for all data sources."""

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def healthcheck(self) -> bool: ...

    @abstractmethod
    async def fetch(self, symbols: list[str]) -> list[MarketDataPoint]: ...
