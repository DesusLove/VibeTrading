"""Structured logging: JSON formatter + request‑ID filter + one‑shot setup."""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

_REQUEST_ID = threading.local()


def set_request_id(rid: str) -> None:
    _REQUEST_ID.value = rid


def get_request_id() -> str:
    return getattr(_REQUEST_ID, "value", "")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True


class JsonFormatter(logging.Formatter):
    """Output log records as newline‑delimited JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": get_request_id() or "-",
        }
        if record.exc_info and record.exc_info[0]:
            entry["exc"] = self.formatException(record.exc_info)
        if hasattr(record, "extra") and record.extra:
            entry["extra"] = record.extra
        return json.dumps(entry, ensure_ascii=False, default=str)


_LOG_CONFIGURED = False


def setup_logging(
    *,
    level: str | None = None,
    json_output: bool | None = None,
    log_file: str | None = None,
) -> None:
    """Configure the root logger once (idempotent).

    Parameters are read from environment variables when not passed explicitly:
    - ``level`` / ``VIBE_TRADING_LOG_LEVEL`` (default ``INFO``)
    - ``json_output`` / ``VIBE_TRADING_LOG_JSON`` (default ``True`` when
      ``VIBE_TRADING_LOG_FILE`` is set, else from env or ``False``)
    - ``log_file`` / ``VIBE_TRADING_LOG_FILE`` (optional file path)
    """
    global _LOG_CONFIGURED
    if _LOG_CONFIGURED:
        return
    _LOG_CONFIGURED = True

    level = (level or os.getenv("VIBE_TRADING_LOG_LEVEL", "INFO")).upper()
    root = logging.getLogger()
    root.setLevel(level)

    has_file = False
    log_file = log_file or os.getenv("VIBE_TRADING_LOG_FILE")
    if log_file:
        has_file = True
        fh = logging.FileHandler(log_file)
        fh.setFormatter(JsonFormatter())
        fh.addFilter(RequestIdFilter())
        root.addHandler(fh)

    json_output = json_output if json_output is not None else os.getenv("VIBE_TRADING_LOG_JSON", "").lower() in ("1", "true", "yes")  # fmt: skip
    if not json_output and not has_file:
        ch = logging.StreamHandler()
        ch.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        root.addHandler(ch)
    elif json_output and not has_file:
        ch = logging.StreamHandler()
        ch.setFormatter(JsonFormatter())
        ch.addFilter(RequestIdFilter())
        root.addHandler(ch)

    # Quiet noisy third‑party loggers
    for noisy in ("httpx", "urllib3", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
