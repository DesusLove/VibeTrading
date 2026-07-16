"""Worker report helpers — extracted from worker.py for modularity."""

from __future__ import annotations

from typing import Any
import json
import logging
from pathlib import Path

from src.agent.tools import ToolRegistry
from src.swarm.models import SwarmAgentSpec
from src.tools.mcp import MCPRemoteTool
from src.tools.redaction import is_sensitive_arg, redact_payload


logger = logging.getLogger(__name__)

_GENERIC_TOOLS = {"bash", "read_file", "write_file", "load_skill", "edit_file"}

_UNPARSED_TOOL_MARKERS = (
    "<\uff5ctool\u2581calls\u2581begin\uff5c>",
    "<tool_calls_begin>",
    "<tool_call_begin>",
    "<tool_sep>",
    "tool\u2581sep",
)
_FABRICATION_MARKERS = ("mock data", "without actual data", "fabricated data", "placeholder data")
_PLAN_PREFIXES = (
    "# phase 1", "## phase 1", "### phase 1",
    "phase 1 \u2014 plan", "phase 1 - plan", "phase 1: plan",
    "# plan", "## plan", "### plan", "**plan**",
)
_HANDOFF_TAILS = (
    "execute", "execute.", "execute:", "skills.", "skills", "proceed?",
    "proceed.", "without writing files.", "let me adjust the approach",
    "let me adjust the approach.", "stand by for final synthesis.",
)


def _best_summary(messages: list[dict], fallback: str) -> str:
    texts = [
        m["content"] for m in messages
        if m.get("role") == "assistant" and m.get("content")
        and len(m["content"].strip()) > 100
    ]
    if texts:
        return max(texts, key=len)
    return fallback


def _remote_tool_metadata(registry: ToolRegistry, tool_name: str) -> dict[str, str]:
    tool = registry.get(tool_name)
    if not isinstance(tool, MCPRemoteTool):
        return {}
    spec = getattr(tool, "_spec", None)
    if spec is None:
        return {}
    return {"server": spec.server_name, "remote_tool": spec.remote_name}


def _preview_tool_arguments(arguments: dict) -> dict[str, str]:
    preview: dict[str, str] = {}
    for key, value in arguments.items():
        if key == "run_dir":
            continue
        if is_sensitive_arg(key):
            preview[key] = "[redacted]"
            continue
        preview[key] = _truncate_preview(redact_payload(value))
    return preview


def _preview_tool_result(result: str) -> str:
    try:
        parsed = json.loads(result)
    except (TypeError, ValueError):
        return _truncate_preview(result)
    return _truncate_preview(redact_payload(parsed))


def _truncate_preview(value: Any, *, limit: int = 200) -> str:
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, default=str)
    else:
        text = str(value)
    return text if len(text) <= limit else text[:limit] + "..."


def _report_written(artifact_dir: Path) -> bool:
    try:
        p = artifact_dir / "report.md"
        return p.is_file() and bool(p.read_text(encoding="utf-8").strip())
    except Exception:
        return False


def _is_data_agent(agent_spec: SwarmAgentSpec) -> bool:
    return bool(set(agent_spec.tools or []) - _GENERIC_TOOLS)


def _is_error_result(result: str) -> bool:
    text = (result or "").strip()
    if not text or not text.startswith("{"):
        return False
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        head = text[:160].lower()
        return '"status": "error"' in head or '"status":"error"' in head
    return isinstance(parsed, dict) and parsed.get("status") == "error"


def _classify_deliverable(
    summary: str,
    *,
    is_data_agent: bool,
    report_written: bool,
    data_tool_calls: int,
) -> str | None:
    text = (summary or "").strip()
    if not text:
        return "empty deliverable"
    low = text.lower()
    if any(m in low for m in _UNPARSED_TOOL_MARKERS):
        return "unparsed tool-call markup (provider did not parse tool calls)"
    if any(m in low for m in _FABRICATION_MARKERS):
        return "explicitly fabricated / mock data"
    if text.startswith("{") and '"status"' in text[:40] and (
        '"content"' in text[:300] or '"ok"' in text[:40]
    ):
        return "raw tool-result envelope, not analysis"
    if low.startswith(_PLAN_PREFIXES):
        tail = low.rsplit("phase 2", 1)[-1].strip() if "phase 2" in low else ""
        if len(text) < 600 or low.rstrip().endswith(_HANDOFF_TAILS) or (
            "phase 2" in low and len(tail) < 80
        ):
            return "plan-only stub (no executed analysis / conclusion)"
    if is_data_agent and not report_written and data_tool_calls == 0:
        return "data agent produced no tool calls and no report.md"
    return None


def _resolve_summary(artifact_dir: Path, fallback: str) -> str:
    report_path = artifact_dir / "report.md"
    try:
        if report_path.is_file():
            content = report_path.read_text(encoding="utf-8").strip()
            if content:
                return content
    except Exception:
        logger.warning("Failed to read report.md from %s", artifact_dir, exc_info=True)
    return fallback


def _persist_messages(artifact_dir: Path, messages: list[dict]) -> None:
    try:
        path = artifact_dir / "messages.json"
        path.write_text(
            json.dumps(messages, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
    except Exception:
        logger.warning("Failed to persist messages to %s", artifact_dir, exc_info=True)


def _write_summary(artifact_dir: Path, summary: str) -> None:
    try:
        summary_path = artifact_dir / "summary.md"
        summary_path.write_text(summary, encoding="utf-8")
    except Exception:
        logger.warning("Failed to write summary to %s", artifact_dir, exc_info=True)


def _collect_artifacts(artifact_dir: Path) -> list[str]:
    if not artifact_dir.exists():
        return []
    return [str(p) for p in artifact_dir.iterdir() if p.is_file()]
