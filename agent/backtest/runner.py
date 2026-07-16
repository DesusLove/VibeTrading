"""Fixed backtest entrypoint: read config.json, select loader by source, import signal_engine, run engine.

Supports ``source="auto"`` to route codes to loaders by symbol format.
Supports ``interval`` for bar size (1m/5m/15m/30m/1H/4H/1D, default 1D).
Supports ``engine`` for backtest engine (daily/options, default daily).

Usage: ``python -m backtest.runner <run_dir>``
"""

import json
import logging
import sys
from pathlib import Path
from typing import List

import pandas as pd

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from backtest.engines._market_hooks import (  # noqa: F401  (re-exported)
    _detect_market,
    _detect_submarket,
    _is_china_futures,
)
from backtest.loaders.base import NoAvailableSourceError, validate_ohlc
from backtest.loaders.registry import (
    FALLBACK_CHAINS,
    LOADER_REGISTRY,
    get_loader_cls_with_fallback,
    resolve_loader,
)

from backtest.runner_config import (
    _AutoLoader,
    _detect_source,
    _get_loader,
    _group_codes_by_market,
    _group_codes_by_source,
    _normalize_codes,
    _MARKET_TO_SOURCE,
    BacktestConfigSchema,
)
from backtest.runner_data import (
    _build_price_panel,
    _columns_required_from_factor_spec,
    _fund_columns_required,
    _inject_fundamental_panel,
    _maybe_inject_fundamentals_for_factor_panel,
    _nan_fundamental_frame,
    _project_panel_fields_to_data_map,
    _selected_factor_specs,
)
from backtest.runner_security import (
    _is_literal_node,
    _is_safe_constant_assignment,
    _is_safe_reference,
    _load_module_from_file,
    _validate_class_body,
    _validate_function_def,
    _validate_signal_engine_class,
    _validate_signal_engine_source,
)

logger = logging.getLogger(__name__)


def main(run_dir: Path) -> None:
    """Load config, fetch data, run the selected backtest engine.

    With ``source="auto"``, routes each code through the appropriate loader.

    Args:
        run_dir: Run directory containing ``config.json`` and ``code/signal_engine.py``.
            The path is validated against the allowed run roots
            (``VIBE_TRADING_ALLOWED_RUN_ROOTS`` plus the defaults) before any
            file is read so an arbitrary filesystem location cannot be used
            to source ``code/signal_engine.py``.
    """
    from src.tools.path_utils import safe_run_dir
    try:
        run_dir = safe_run_dir(str(run_dir))
    except ValueError as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    config_path = run_dir / "config.json"
    if not config_path.exists():
        print(json.dumps({"error": "config.json not found"}))
        sys.exit(1)

    raw_config = json.loads(config_path.read_text(encoding="utf-8"))

    try:
        BacktestConfigSchema(**raw_config)
    except Exception as exc:
        errors = str(exc)
        print(json.dumps({"error": f"Invalid config: {errors}"}))
        sys.exit(1)

    config = raw_config
    source = config.get("source", "tushare")
    codes = config.get("codes", [])

    signal_path = run_dir / "code" / "signal_engine.py"
    if not signal_path.exists():
        print(json.dumps({"error": "code/signal_engine.py not found"}))
        sys.exit(1)

    try:
        signal_module = _load_module_from_file(signal_path, "signal_engine")
    except ValueError as exc:
        print(json.dumps({"error": f"SignalEngine source error: {exc}"}))
        sys.exit(1)
    engine_cls = getattr(signal_module, "SignalEngine", None)
    if engine_cls is None:
        print(json.dumps({"error": "SignalEngine class not found in signal_engine.py"}))
        sys.exit(1)

    try:
        _validate_signal_engine_class(engine_cls)
    except ValueError as exc:
        print(json.dumps({"error": f"SignalEngine interface error: {exc}"}))
        sys.exit(1)

    interval = config.get("interval", "1D")

    if source == "auto":
        data_map = _fetch_auto(codes, config, interval)
    else:
        codes = _normalize_codes(codes, source)
        config["codes"] = codes
        LoaderCls = _get_loader(source)
        loader = LoaderCls()
        data_map = loader.fetch(
            codes,
            config.get("start_date", ""),
            config.get("end_date", ""),
            fields=config.get("extra_fields") or None,
            interval=interval,
        )
        if data_map and len(data_map) < len(codes):
            missing = set(codes) - set(data_map.keys())
            logger.warning(
                "source=%s returned data for %d/%d symbols; missing: %s",
                source, len(data_map), len(codes), missing,
            )
        if not data_map and codes:
            market = _detect_market(codes[0])
            for fb_name in FALLBACK_CHAINS.get(market, []):
                if fb_name == source or fb_name not in LOADER_REGISTRY:
                    continue
                fb_loader = LOADER_REGISTRY[fb_name]()
                if not fb_loader.is_available():
                    continue
                fb_codes = _normalize_codes(codes, fb_name)
                data_map = fb_loader.fetch(
                    fb_codes, config.get("start_date", ""),
                    config.get("end_date", ""), interval=interval,
                )
                if data_map:
                    logger.info("Runtime fallback: %s -> %s", source, fb_name)
                    source = fb_name
                    loader = fb_loader
                    break

    data_map = _sanitize_data_map(data_map)
    if not data_map:
        print(json.dumps({"error": "No data fetched"}))
        sys.exit(1)
    data_map = _maybe_inject_fundamentals_for_factor_panel(data_map, config)

    if source == "auto":
        config["_run_card_effective_sources"] = sorted(_group_codes_by_source(codes))
    else:
        config["_run_card_effective_sources"] = [source]

    engine_type = config.get("engine", "daily")
    signal_engine = engine_cls()

    effective_source = _detect_primary_source(codes, source)
    from backtest.metrics import calc_bars_per_year
    market_types = {_detect_market(c) for c in codes}
    if len(market_types) > 1:
        bars_per_year = None
    else:
        bars_per_year = calc_bars_per_year(interval, effective_source)

    if source == "auto":
        loader = _AutoLoader(data_map)

    if engine_type == "options":
        from backtest.engines.options_portfolio import run_options_backtest
        run_options_backtest(config, loader, signal_engine, run_dir, bars_per_year=bars_per_year)
    else:
        market_engine = _create_market_engine(effective_source, config, codes)
        market_engine.run_backtest(config, loader, signal_engine, run_dir, bars_per_year=bars_per_year)


def _create_market_engine(source: str, config: dict, codes: List[str]):
    """Create the appropriate market engine based on data source and market type.

    Routing priority:
      1. Detect market type from symbol patterns (futures, forex, etc.)
      2. Fall back to source-based routing (okx->crypto, tushare->china_a, etc.)

    Args:
        source: Data source (okx/ccxt/tushare/akshare/yfinance).
        config: Backtest configuration.
        codes: Instrument codes.

    Returns:
        BaseEngine subclass instance.
    """
    markets = {_detect_market(c) for c in codes} if codes else set()

    if len(markets) > 1:
        from backtest.engines.composite import CompositeEngine
        return CompositeEngine(config, codes)

    if "futures" in markets:
        if any(_is_china_futures(c) for c in codes):
            from backtest.engines.china_futures import ChinaFuturesEngine
            return ChinaFuturesEngine(config)
        from backtest.engines.global_futures import GlobalFuturesEngine
        return GlobalFuturesEngine(config)

    if "forex" in markets:
        from backtest.engines.forex import ForexEngine
        return ForexEngine(config)

    if "india_equity" in markets:
        from backtest.engines.india_equity import IndiaEquityEngine
        return IndiaEquityEngine(config)

    if source in ("okx", "ccxt"):
        from backtest.engines.crypto import CryptoEngine
        return CryptoEngine(config)
    elif source in ("tushare", "akshare"):
        if markets & {"us_equity", "hk_equity"}:
            from backtest.engines.global_equity import GlobalEquityEngine
            market = _detect_submarket(codes)
            return GlobalEquityEngine(config, market=market)
        from backtest.engines.china_a import ChinaAEngine
        return ChinaAEngine(config)
    elif source == "yfinance":
        from backtest.engines.global_equity import GlobalEquityEngine
        market = _detect_submarket(codes)
        return GlobalEquityEngine(config, market=market)
    else:
        from backtest.engines.crypto import CryptoEngine
        return CryptoEngine(config)


def _detect_primary_source(codes: List[str], source: str) -> str:
    """Pick primary source for annualization (e.g. bars per year).

    Args:
        codes: All symbols.
        source: Config ``source`` field.

    Returns:
        Dominant source name.
    """
    if source != "auto":
        return source
    groups = _group_codes_by_source(codes)
    if len(groups) == 1:
        return list(groups.keys())[0]
    return max(groups, key=lambda s: len(groups[s]))


def _fetch_auto(codes: List[str], config: dict, interval: str = "1D") -> dict:
    """Auto mode: route each market group through fallback chain.

    Args:
        codes: All symbols.
        config: Backtest config dict.
        interval: Bar interval string.

    Returns:
        Merged ``code -> DataFrame`` map.
    """
    market_groups = _group_codes_by_market(codes)
    merged = {}
    start_date = config.get("start_date", "")
    end_date = config.get("end_date", "")

    for market, market_codes in market_groups.items():
        try:
            loader = resolve_loader(market)
        except NoAvailableSourceError as exc:
            legacy_src = _MARKET_TO_SOURCE.get(market, "tushare")
            logger.warning("Fallback chain failed for %s: %s — trying %s", market, exc, legacy_src)
            LoaderCls = _get_loader(legacy_src)
            loader = LoaderCls()

        src_name = getattr(loader, "name", "unknown")
        normalized_codes = _normalize_codes(market_codes, src_name)
        fields = config.get("extra_fields") if src_name == "tushare" else None
        result = loader.fetch(normalized_codes, start_date, end_date, fields=fields, interval=interval)

        if not result:
            for fb_name in FALLBACK_CHAINS.get(market, []):
                if fb_name == src_name or fb_name not in LOADER_REGISTRY:
                    continue
                fb_loader = LOADER_REGISTRY[fb_name]()
                if not fb_loader.is_available():
                    continue
                fb_codes = _normalize_codes(market_codes, fb_name)
                result = fb_loader.fetch(fb_codes, start_date, end_date, interval=interval)
                if result:
                    logger.info("Runtime fallback: %s -> %s for %s", src_name, fb_name, market)
                    break

        merged.update(result)

    return merged


def _sanitize_data_map(data_map: dict) -> dict:
    """Drop structurally-invalid OHLC bars from every fetched frame.

    Each loader only drops NaN rows, so a bar that violates the OHLC
    invariants (``high < low``, a non-positive price, or a high/low that fails
    to bracket open/close) can still reach the backtest and surface as NaN/inf
    metrics. Applying :func:`validate_ohlc` here — the single point every
    fetched map converges through — guards every source uniformly (``auto``,
    single-source, runtime fallback, and any future loader), so the per-loader
    checks no longer have to be added one at a time.

    Args:
        data_map: ``code -> DataFrame`` map as returned by a loader fetch.

    Returns:
        The same mapping with each frame's invalid bars removed.
    """
    return {code: validate_ohlc(frame) for code, frame in data_map.items()}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m backtest.runner <run_dir>")
        sys.exit(1)
    main(Path(sys.argv[1]))
