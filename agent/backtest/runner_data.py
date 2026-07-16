import logging
from collections.abc import Iterable
from typing import Any

import pandas as pd

from backtest.loaders.base import NoAvailableSourceError, validate_ohlc
from backtest.loaders.registry import (
    FALLBACK_CHAINS,
    LOADER_REGISTRY,
    VALID_SOURCES,
    get_loader_cls_with_fallback,
    resolve_loader,
)

logger = logging.getLogger(__name__)

_PRICE_PANEL_COLUMNS = ("open", "high", "low", "close", "volume", "vwap", "amount")
_FUND_PREFIX = "fund:"


def _columns_required_from_factor_spec(spec: Any) -> list[str]:
    if isinstance(spec, dict):
        meta = spec.get("meta")
        if isinstance(meta, dict):
            return [str(c) for c in meta.get("columns_required", [])]
        return [str(c) for c in spec.get("columns_required", [])]
    meta = getattr(spec, "meta", None)
    if isinstance(meta, dict):
        return [str(c) for c in meta.get("columns_required", [])]
    columns = getattr(spec, "columns_required", None)
    if columns is not None:
        return [str(c) for c in columns]
    return []


def _selected_factor_specs(config: dict) -> list[Any]:
    specs: list[Any] = []
    for key in ("selected_factors", "factors", "alpha_metas"):
        raw = config.get(key)
        if isinstance(raw, list):
            specs.extend(raw)
        elif raw:
            specs.append(raw)

    alpha_ids: list[str] = []
    for key in ("alpha_ids", "factor_ids", "alphas"):
        raw = config.get(key)
        if raw is None:
            continue
        if isinstance(raw, str):
            alpha_ids.append(raw)
        else:
            alpha_ids.extend(str(item) for item in raw)

    if alpha_ids:
        from src.factors.registry import get_default_registry

        registry = get_default_registry()
        for alpha_id in alpha_ids:
            try:
                specs.append(registry.get(alpha_id).meta)
            except KeyError:
                logger.warning("selected alpha_id %r is not registered; skipping", alpha_id)
    return specs


def _fund_columns_required(selected_factors: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for spec in selected_factors:
        for column in _columns_required_from_factor_spec(spec):
            if not column.startswith(_FUND_PREFIX) or column in seen:
                continue
            seen.add(column)
            out.append(column)
    return out


def _build_price_panel(data_map: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    panel: dict[str, pd.DataFrame] = {}
    for column in _PRICE_PANEL_COLUMNS:
        series_by_symbol = {
            symbol: frame[column]
            for symbol, frame in data_map.items()
            if column in frame.columns
        }
        if series_by_symbol:
            panel[column] = pd.DataFrame(series_by_symbol)
    return panel


def _nan_fundamental_frame(
    index: pd.DatetimeIndex,
    symbols: list[str],
) -> pd.DataFrame:
    return pd.DataFrame(float("nan"), index=index, columns=symbols)


def _inject_fundamental_panel(
    panel: dict[str, pd.DataFrame],
    *,
    symbols: list[str],
    fund_columns: Iterable[str],
    start: str,
    end: str,
    freq: str = "ttm",
    pit: bool = True,
    source: str = "auto",
    index: pd.DatetimeIndex | None = None,
) -> dict[str, pd.DataFrame]:
    fields = [column[len(_FUND_PREFIX):] for column in fund_columns if column.startswith(_FUND_PREFIX)]
    fields = list(dict.fromkeys(fields))
    if not fields:
        return panel

    price_index = index
    if price_index is None:
        close = panel.get("close")
        price_index = close.index if close is not None else pd.DatetimeIndex([])

    try:
        from backtest.loaders.fundamentals_loader import load_fundamental_panel

        loaded = load_fundamental_panel(
            symbols=symbols,
            fields=fields,
            start=start,
            end=end,
            freq=freq,
            pit=pit,
            source=source,
            index=price_index,
        )
    except Exception as exc:
        logger.warning(
            "fundamental panel load failed for fields=%s symbols=%s: %s; injecting NaN frames",
            fields,
            symbols,
            exc,
            exc_info=True,
        )
        loaded = {}

    for field in fields:
        frame = loaded.get(field)
        if not isinstance(frame, pd.DataFrame):
            frame = _nan_fundamental_frame(price_index, symbols)
        else:
            frame = frame.reindex(index=price_index, columns=symbols)
        panel[f"{_FUND_PREFIX}{field}"] = frame
    return panel


def _project_panel_fields_to_data_map(
    data_map: dict[str, pd.DataFrame],
    panel: dict[str, pd.DataFrame],
    fund_columns: Iterable[str],
) -> dict[str, pd.DataFrame]:
    out = {symbol: frame.copy() for symbol, frame in data_map.items()}
    for column in fund_columns:
        frame = panel.get(column)
        if frame is None:
            continue
        for symbol, symbol_frame in out.items():
            if symbol in frame.columns:
                symbol_frame[column] = frame[symbol].reindex(symbol_frame.index)
            else:
                symbol_frame[column] = float("nan")
    return out


def _maybe_inject_fundamentals_for_factor_panel(
    data_map: dict[str, pd.DataFrame],
    config: dict,
) -> dict[str, pd.DataFrame]:
    selected_factors = _selected_factor_specs(config)
    fund_columns = _fund_columns_required(selected_factors)
    if not fund_columns:
        return data_map

    panel = _build_price_panel(data_map)
    close = panel.get("close")
    price_index = close.index if close is not None else pd.DatetimeIndex([])
    symbols = list(data_map)
    _inject_fundamental_panel(
        panel,
        symbols=symbols,
        fund_columns=fund_columns,
        start=config.get("start_date", ""),
        end=config.get("end_date", ""),
        freq="ttm",
        pit=True,
        source="auto",
        index=price_index,
    )
    return _project_panel_fields_to_data_map(data_map, panel, fund_columns)
