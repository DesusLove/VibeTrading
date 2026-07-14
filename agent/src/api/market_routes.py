"""Live market ticker route.

Provides real-time price quotes for the ticker bar via yfinance (free, no auth).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import yfinance as yf
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])

SYMBOL_MAP: dict[str, str] = {
    "SPX": "^GSPC",
    "NDX": "^NDX",
    "DJI": "^DJI",
    "VIX": "^VIX",
    "BTC/USD": "BTC-USD",
    "ETH/USD": "ETH-USD",
    "EUR/USD": "EURUSD=X",
    "US10Y": "^TNX",
    "WTI": "CL=F",
    "XAU/USD": "GC=F",
}

REVERSE_MAP: dict[str, str] = {v: k for k, v in SYMBOL_MAP.items()}


def _build_ticker(symbol: str, info: dict[str, Any]) -> dict[str, Any] | None:
    display = REVERSE_MAP.get(symbol, symbol)
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
    if price is None or prev_close is None or prev_close == 0 or price == 0:
        return None
    change = round(price - prev_close, 2)
    pct = round((change / prev_close) * 100, 2)
    dir_: str = "up" if change > 0 else "down" if change < 0 else "neutral"

    if display in ("US10Y",):
        price_str = f"{price:.3f}%"
    elif price < 10:
        price_str = f"{price:.4f}"
    elif price < 1000:
        price_str = f"{price:,.2f}"
    else:
        price_str = f"{price:,.2f}"

    change_str = f"{change:+.2f}" if abs(change) >= 0.01 else f"{change:+.4f}"
    pct_str = f"{pct:+.2f}%"

    return {
        "symbol": display,
        "price": price_str,
        "change": change_str,
        "pct": pct_str,
        "dir": dir_,
    }


def _fetch_single(yf_sym: str) -> dict[str, Any] | None:
    """Fetch a single yfinance symbol (runs in thread pool)."""
    try:
        ticker = yf.Ticker(yf_sym)
        info = ticker.fast_info if hasattr(ticker, "fast_info") else {}
        if info and (info.get("lastPrice") or info.get("regularMarketPrice") or info.get("previousClose")):
            entry = _build_ticker(
                yf_sym,
                {
                    "currentPrice": info.get("lastPrice") or info.get("regularMarketPrice"),
                    "previousClose": info.get("previousClose"),
                    "regularMarketPrice": info.get("lastPrice") or info.get("regularMarketPrice"),
                    "regularMarketPreviousClose": info.get("previousClose"),
                },
            )
            if entry:
                return entry

        info2 = ticker.info or {}
        entry = _build_ticker(yf_sym, info2)
        if entry:
            return entry

        logger.warning("No price data for %s", yf_sym)
    except Exception as exc:
        logger.debug("Failed to fetch %s: %s", yf_sym, exc)
    return None


@router.get("/ticker")
async def get_ticker() -> list[dict[str, Any]]:
    yf_symbols = list(SYMBOL_MAP.values())

    results: list[dict[str, Any]] = []
    tasks = [asyncio.to_thread(_fetch_single, sym) for sym in yf_symbols]
    for coro in asyncio.as_completed(tasks):
        try:
            entry = await asyncio.wait_for(coro, timeout=10.0)
            if entry:
                results.append(entry)
        except (asyncio.TimeoutError, Exception):
            logger.debug("Timeout or error fetching symbol")

    return results
