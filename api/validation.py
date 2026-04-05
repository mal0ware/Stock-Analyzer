"""
Input validation — strict whitelisting carried from v1 (OWASP A03:2021).
"""

from fastapi import HTTPException

from config import SYMBOL_PATTERN, VALID_PERIODS


def validate_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    if not SYMBOL_PATTERN.match(s):
        raise HTTPException(400, f"Invalid ticker symbol: '{symbol}'")
    return s


def validate_period(period: str) -> str:
    if period not in VALID_PERIODS:
        raise HTTPException(400, f"Invalid period: '{period}'. Allowed: {', '.join(sorted(VALID_PERIODS))}")
    return period
