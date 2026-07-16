import logging
from typing import Any, Dict, List, Optional

import pandas as pd
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from backtest.engines._market_hooks import _detect_market, _detect_submarket, _is_china_futures
from backtest.loaders.base import NoAvailableSourceError
from backtest.loaders.registry import LOADER_REGISTRY, VALID_SOURCES, get_loader_cls_with_fallback

logger = logging.getLogger(__name__)

_VALID_INTERVALS = {"1m", "5m", "15m", "30m", "1H", "4H", "1D"}
_VALID_ENGINES = {"daily", "options"}

_MARKET_TO_SOURCE = {
    "a_share": "tushare",
    "us_equity": "yfinance",
    "hk_equity": "yfinance",
    "india_equity": "yahoo",
    "crypto": "okx",
    "futures": "tushare",
    "fund": "tushare",
    "macro": "akshare",
    "forex": "akshare",
}


class BacktestConfigSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    codes: List[str]
    start_date: str
    end_date: str
    source: str = "tushare"
    interval: str = "1D"
    engine: str = "daily"
    fundamental_fields: Optional[Dict[str, List[str]]] = None
    event_feeds: Optional[List[Dict[str, Any]]] = None

    @field_validator("codes")
    @classmethod
    def codes_not_empty(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("codes must be a non-empty list")
        if any(not c.strip() for c in v):
            raise ValueError("codes must not contain empty strings")
        return v

    @field_validator("start_date", "end_date")
    @classmethod
    def valid_date(cls, v: str) -> str:
        try:
            pd.Timestamp(v)
        except Exception:
            raise ValueError(f"invalid date format: {v!r} (expected YYYY-MM-DD)")
        return v

    @field_validator("interval")
    @classmethod
    def valid_interval(cls, v: str) -> str:
        if v not in _VALID_INTERVALS:
            raise ValueError(f"unsupported interval {v!r}, must be one of {_VALID_INTERVALS}")
        return v

    @field_validator("engine")
    @classmethod
    def valid_engine(cls, v: str) -> str:
        if v not in _VALID_ENGINES:
            raise ValueError(f"unsupported engine {v!r}, must be one of {_VALID_ENGINES}")
        return v

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in VALID_SOURCES:
            raise ValueError(f"unsupported source {v!r}, must be one of {VALID_SOURCES}")
        return v

    @field_validator("fundamental_fields")
    @classmethod
    def valid_fundamental_fields(
        cls,
        v: Optional[Dict[str, List[str]]],
    ) -> Optional[Dict[str, List[str]]]:
        if v is None:
            return v
        for table, fields in v.items():
            if not table.strip():
                raise ValueError("fundamental_fields table names must be non-empty strings")
            if any(not field.strip() for field in fields):
                raise ValueError("fundamental_fields field names must be non-empty strings")
        return v

    @field_validator("event_feeds")
    @classmethod
    def valid_event_feeds(cls, v: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
        if v is None:
            return v
        for entry in v:
            if not isinstance(entry, dict):
                raise ValueError(
                    "each event_feeds entry must be an object with name/route_template/event_type"
                )
            for key in ("name", "route_template", "event_type"):
                if not str(entry.get(key, "")).strip():
                    raise ValueError(f"event_feeds entry missing required field: {key}")
        return v

    @model_validator(mode="after")
    def start_before_end(self) -> "BacktestConfigSchema":
        if pd.Timestamp(self.start_date) > pd.Timestamp(self.end_date):
            raise ValueError(
                f"start_date ({self.start_date}) must be <= end_date ({self.end_date})"
            )
        return self


def _detect_source(code: str) -> str:
    market = _detect_market(code)
    return _MARKET_TO_SOURCE.get(market, "tushare")


def _group_codes_by_market(codes: List[str]) -> Dict[str, List[str]]:
    groups: Dict[str, List[str]] = {}
    for code in codes:
        market = _detect_market(code)
        groups.setdefault(market, []).append(code)
    return groups


def _group_codes_by_source(codes: List[str]) -> Dict[str, List[str]]:
    groups: Dict[str, List[str]] = {}
    for code in codes:
        src = _detect_source(code)
        groups.setdefault(src, []).append(code)
    return groups


def _get_loader(source: str):
    try:
        return get_loader_cls_with_fallback(source)
    except NoAvailableSourceError:
        if "tushare" in LOADER_REGISTRY:
            return LOADER_REGISTRY["tushare"]
        raise


def _normalize_codes(codes: List[str], source: str) -> List[str]:
    if source in ("okx", "ccxt"):
        return [c.replace("/", "-").upper() for c in codes]
    return codes


class _AutoLoader:
    def __init__(self, data_map: dict):
        self._data = data_map

    def fetch(self, codes, start_date, end_date, fields=None, interval="1D"):
        return {c: df for c, df in self._data.items() if c in codes}
