"""Live market ticker and history routes.

Primary: Yahoo Finance v8/chart API (free, no auth).
Fallbacks: CoinGecko (crypto), synthetic data (demo mode).
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote

import requests
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])

_SESSION = requests.Session()
_SESSION.headers["User-Agent"] = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

_YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL = 300.0

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

YF_RANGE: dict[str, str] = {
    "1m": "1d", "5m": "5d", "15m": "1mo", "30m": "1mo",
    "1h": "1mo", "4h": "6mo", "24h": "1y",
    "1d": "1d", "5d": "5d", "1mo": "1y", "3mo": "3mo",
    "6mo": "6mo", "1y": "5y", "2y": "2y", "5y": "5y", "max": "max",
}
YF_INTERVAL: dict[str, str] = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "60m", "4h": "1d", "24h": "1d",
    "1d": "1m", "5d": "5m", "1mo": "1d", "3mo": "1d",
    "6mo": "1d", "1y": "1d", "2y": "1wk", "5y": "1wk", "max": "1mo",
}

COINGECKO_IDS: dict[str, str] = {
    "BTC-USD": "bitcoin",
    "ETH-USD": "ethereum",
    "SOL-USD": "solana",
    "XRP-USD": "ripple",
    "ADA-USD": "cardano",
    "DOGE-USD": "dogecoin",
    "DOT-USD": "polkadot",
    "AVAX-USD": "avalanche-2",
    "LINK-USD": "chainlink",
    "MATIC-USD": "matic-network",
    "ATOM-USD": "cosmos",
    "UNI-USD": "uniswap",
    "LTC-USD": "litecoin",
    "BCH-USD": "bitcoin-cash",
    "BNB-USD": "binancecoin",
}

# ── helpers ──────────────────────────────────────────────────────────────────

def _cache_get(key: str) -> list[dict[str, Any]] | None:
    entry = _CACHE.get(key)
    if entry and time.monotonic() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None

def _cache_set(key: str, data: list[dict[str, Any]]) -> None:
    _CACHE[key] = (time.monotonic(), data)

async def _fetch_yahoo_with_retry(
    symbol: str, period: str, *, max_retries: int = 2, delay: float = 1.0
) -> list[dict[str, Any]] | None:
    cache_key = f"yahoo:{symbol}:{period}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    yf_range = YF_RANGE.get(period, "1y")
    yf_interval = YF_INTERVAL.get(period, "1d")
    url = f"{_YAHOO_BASE}/{quote(symbol, safe='')}?range={yf_range}&interval={yf_interval}"

    for attempt in range(max_retries + 1):
        try:
            resp = _SESSION.get(url, timeout=15)
            if resp.status_code == 429:
                logger.warning("Yahoo 429 for %s (attempt %d/%d)", symbol, attempt + 1, max_retries + 1)
                if attempt < max_retries:
                    await asyncio.sleep(delay * (2 ** attempt))
                continue
            resp.raise_for_status()
            data = resp.json()
            result = data.get("chart", {}).get("result")
            if not result:
                return []
            result = result[0]
            timestamps = result.get("timestamp", [])
            quotes = result.get("indicators", {}).get("quote", [{}])[0]
            records: list[dict[str, Any]] = []
            for i, ts in enumerate(timestamps):
                o = quotes.get("open", [None])[i]
                h = quotes.get("high", [None])[i]
                l = quotes.get("low", [None])[i]
                c = quotes.get("close", [None])[i]
                v = quotes.get("volume", [None])[i]
                if o is None or h is None or l is None or c is None:
                    continue
                records.append({
                    "time": int(ts),
                    "open": round(float(o), 4),
                    "high": round(float(h), 4),
                    "low": round(float(l), 4),
                    "close": round(float(c), 4),
                    "volume": int(v or 0),
                })
            _cache_set(cache_key, records)
            return records
        except (requests.RequestException, ValueError, KeyError) as exc:
            logger.debug("Yahoo fetch error for %s: %s", symbol, exc)
            if attempt < max_retries:
                await asyncio.sleep(delay)
            continue
    return None

async def _fetch_coingecko(symbol: str, period: str) -> list[dict[str, Any]] | None:
    symbol_upper = symbol.upper()
    coin_id = COINGECKO_IDS.get(symbol_upper)
    if not coin_id:
        return None

    days_map: dict[str, int] = {"1m": 1, "5m": 1, "15m": 1, "30m": 1, "1h": 7, "4h": 30, "24h": 90, "1d": 1, "5d": 5, "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = days_map.get(period, 365)

    try:
        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/ohlc?vs_currency=usd&days={days}"
        resp = _SESSION.get(url, timeout=10)
        if resp.status_code == 429:
            logger.warning("CoinGecko rate limited for %s", symbol)
            return None
        resp.raise_for_status()
        ohlc = resp.json()
        if not ohlc or len(ohlc) < 2:
            return None
        return [
            {
                "time": int(o[0] / 1000),
                "open": round(float(o[1]), 4),
                "high": round(float(o[2]), 4),
                "low": round(float(o[3]), 4),
                "close": round(float(o[4]), 4),
                "volume": 0,
            }
            for o in ohlc
        ]
    except (requests.RequestException, ValueError, KeyError) as exc:
        logger.debug("CoinGecko error for %s: %s", symbol, exc)
        return None

def _generate_synthetic(symbol: str, period: str) -> list[dict[str, Any]]:
    bars: list[dict[str, Any]] = []
    now = datetime.now()
    count_map: dict[str, int] = {"1m": 390, "5m": 390, "15m": 390, "30m": 390, "1h": 390, "4h": 390, "24h": 365, "1d": 24, "5d": 120, "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "5y": 1825}
    count = count_map.get(period, 365)

    base = 100.0
    if symbol in ("BTC-USD", "BTC/USD"):
        base = 60000.0
    elif symbol in ("ETH-USD", "ETH/USD"):
        base = 3500.0
    elif symbol == "SPY":
        base = 750.0
    elif symbol in ("QQQ", "NDX", "^NDX"):
        base = 480.0
    elif symbol == "AAPL":
        base = 220.0
    elif symbol == "MSFT":
        base = 450.0
    elif symbol == "GOOGL":
        base = 180.0
    elif symbol == "AMZN":
        base = 200.0

    intraday_intervals: dict[str, int] = {"1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400}
    interval = intraday_intervals.get(period, 86400)
    seed = sum(ord(c) for c in symbol)
    rng = random.Random(seed)
    price = base
    for i in range(count):
        ts = int(now.timestamp()) - (count - 1 - i) * interval
        change_pct = rng.gauss(0, 0.015)
        open_p = price
        close_p = open_p * (1 + change_pct)
        high_p = max(open_p, close_p) * (1 + abs(rng.gauss(0, 0.005)))
        low_p = min(open_p, close_p) * (1 - abs(rng.gauss(0, 0.005)))
        vol = int(rng.gauss(50_000_000, 10_000_000))
        bars.append({
            "time": ts,
            "open": round(open_p, 4),
            "high": round(high_p, 4),
            "low": round(low_p, 4),
            "close": round(close_p, 4),
            "volume": max(vol, 1_000_000),
        })
        price = close_p
    return bars

# ── routes ───────────────────────────────────────────────────────────────────

@router.get("/history")
async def get_history(symbol: str = "SPY", period: str = "1y") -> list[dict[str, Any]]:
    symbol_upper = symbol.upper().strip()

    records = await _fetch_yahoo_with_retry(symbol_upper, period)
    if records is not None:
        return records

    records = await _fetch_coingecko(symbol_upper, period)
    if records is not None:
        return records

    logger.info("Falling back to synthetic data for %s", symbol_upper)
    return _generate_synthetic(symbol_upper, period)


@router.get("/ticker")
async def get_ticker() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    tasks = []
    for display_name, yf_sym in SYMBOL_MAP.items():
        tasks.append(asyncio.to_thread(_fetch_ticker_single, display_name, yf_sym))

    for coro in asyncio.as_completed(tasks):
        try:
            entry = await asyncio.wait_for(coro, timeout=10.0)
            if entry:
                results.append(entry)
        except (asyncio.TimeoutError, Exception):
            logger.debug("Timeout or error fetching ticker")

    return results

def _fetch_ticker_single(display_name: str, yf_sym: str) -> dict[str, Any] | None:
    try:
        url = f"{_YAHOO_BASE}/{quote(yf_sym, safe='')}?range=1d&interval=1d"
        resp = _SESSION.get(url, timeout=10)
        if resp.status_code == 429:
            logger.debug("Yahoo 429 for ticker %s", yf_sym)
            return None
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result")
        if not result:
            return None
        result = result[0]
        meta = result.get("meta", {})
        quotes = result.get("indicators", {}).get("quote", [{}])[0]
        timestamps = result.get("timestamp", [])
        if not timestamps or not quotes:
            return None
        prev_close = meta.get("previousClose")
        current_price = quotes.get("close", [None])[-1]
        if current_price is None:
            current_price = meta.get("regularMarketPrice") or meta.get("chartPreviousClose")
        if current_price is None or prev_close is None or prev_close == 0:
            return None
        change = round(current_price - prev_close, 2)
        pct = round((change / prev_close) * 100, 2)
        dir_: str = "up" if change > 0 else "down" if change < 0 else "neutral"

        if display_name == "US10Y":
            price_str = f"{current_price:.3f}%"
        elif current_price < 10:
            price_str = f"{current_price:.4f}"
        else:
            price_str = f"{current_price:,.2f}"

        return {
            "symbol": display_name,
            "price": price_str,
            "change": f"{change:+.2f}" if abs(change) >= 0.01 else f"{change:+.4f}",
            "pct": f"{pct:+.2f}%",
            "dir": dir_,
        }
    except Exception as exc:
        logger.debug("Failed to fetch ticker %s: %s", yf_sym, exc)
        return None
