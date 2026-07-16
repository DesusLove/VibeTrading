"""Regression tests for read_url third-party (Jina) hardening.

Network is mocked; no live r.jina.ai calls. Asserts: HTTP errors surface
the upstream status + body for debugging; a cached snapshot is surfaced
via `cached: true`; `no_cache=True` sends the x-no-cache header while
the default path is byte-identical (no extra header).
"""


import json

import pytest

import src.tools.web_reader_tool as wr
from src.tools.web_reader_tool import read_url

URL = "https://example.com/page"


class _Resp:
    def __init__(self, status_code=200, text=""):
        self.status_code = status_code
        self.text = text


@pytest.fixture
def captured(monkeypatch):
    box = {}

    def fake_get(url, headers=None, timeout=None):
        box["url"] = url
        box["headers"] = headers or {}
        r = box["resp"]
        if isinstance(r, BaseException):
            raise r
        return r

    monkeypatch.setattr(wr.requests, "get", fake_get)
    return box


def test_http_error_surfaces_status_and_body(captured):
    """Test that HTTP errors from the reader include status code and body."""
    captured["resp"] = _Resp(451, "ParamValidationError: bad input")
    out = json.loads(read_url(URL))
    assert out["status"] == "error", f"Expected error status, got: {out}"
    assert "451" in out["error"], f"Expected status code 451 in error: {out['error']}"
    assert "ParamValidationError: bad input" in out["error"], \
        f"Expected error message in: {out['error']}"


def test_exception_error_surfaces_exc_text(captured):
    """Test that request exceptions surface the exception text."""
    captured["resp"] = RuntimeError("boom: connect failed (10.0.0.1)")
    out = json.loads(read_url(URL))
    assert out["status"] == "error", f"Expected error status, got: {out}"
    assert "boom: connect failed" in out["error"], \
        f"Expected exception message in error: {out['error']}"


def test_cached_snapshot_is_flagged(captured):
    """Test that cached responses are properly flagged."""
    captured["resp"] = _Resp(200, "Title: X\n\nWarning: This is a cached snapshot\n\nbody")
    out = json.loads(read_url(URL))
    assert out["status"] == "ok", f"Expected ok status, got: {out}"
    assert out.get("cached") is True, f"Expected cached=True, got: {out.get('cached')}"


def test_fresh_response_has_no_cached_key(captured):
    """Test that fresh responses don't include the cached flag."""

    captured["resp"] = _Resp(200, "Title: X\n\nlive body content")
    out = json.loads(read_url(URL))
    assert out["status"] == "ok", f"Expected ok status, got: {out}"
    assert "cached" not in out, f"Fresh response should not have cached key, got: {out}"


def test_no_cache_header_opt_in_only(captured):
    captured["resp"] = _Resp(200, "Title: X\n\nbody")
    read_url(URL)  # default
    assert "x-no-cache" not in {k.lower() for k in captured["headers"]}
    read_url(URL, no_cache=True)
    assert captured["headers"].get("x-no-cache") == "true"