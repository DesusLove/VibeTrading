"""Utility functions extracted from loop.py.

Five-layer context management:
  Layer 1 (microcompact)     — prunes old tool results once under memory pressure
  Layer 2 (context_collapse) — folds long text blocks without LLM call (zero cost)
  Layer 3 (auto_compact)     — LLM structured summary with token-budget tail protection
  Layer 4 (compact tool)     — model explicitly calls the compact tool to trigger L3
  Layer 5 (iterative update) — Nth compression updates previous summary instead of starting fresh

Tool execution:
  - Read/write batching: consecutive readonly tools run in parallel via threads
"""


import copy
import json
import logging
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.config.accessor import get_env_config
from src.tools.redaction import redact_payload

logger = logging.getLogger(__name__)

KEEP_RECENT = 3
TOOL_RESULT_LIMIT = 10_000
LLM_USAGE_ARTIFACT = "llm_usage.json"

COLLAPSE_PRESERVE_RECENT = 6
COLLAPSE_TEXT_MIN = 2400
COLLAPSE_HEAD = 900
COLLAPSE_TAIL = 500

TAIL_TOKEN_BUDGET = 20_000

RUNS_DIR = Path(__file__).resolve().parents[2] / "runs"
SESSIONS_DIR = Path(__file__).resolve().parents[2] / "sessions"


def _override(name: str):
    """Return a monkeypatched module-level override if present."""
    mod = sys.modules.get("src.agent.loop")
    if mod is not None and name in mod.__dict__:
        return mod.__dict__[name]
    return None


def _token_threshold() -> int:
    ov = _override("TOKEN_THRESHOLD")
    if ov is not None:
        return ov
    return get_env_config().agent_tuning.token_threshold


def _heartbeat_interval_s() -> float:
    ov = _override("HEARTBEAT_INTERVAL_S")
    if ov is not None:
        return ov
    return get_env_config().agent_tuning.vt_heartbeat_interval_s


def _reasoning_delta_min_interval_s() -> float:
    ov = _override("REASONING_DELTA_MIN_INTERVAL_S")
    if ov is not None:
        return ov
    return get_env_config().agent_tuning.vt_reasoning_delta_min_interval_s


def _stream_retry_delay_s() -> float:
    ov = _override("STREAM_RETRY_DELAY_S")
    if ov is not None:
        return ov
    return get_env_config().agent_tuning.vt_stream_retry_delay_s


def _tool_timeout_seconds() -> float:
    ov = _override("TOOL_TIMEOUT_SECONDS")
    if ov is not None:
        return ov
    return get_env_config().agent_tuning.vibe_trading_tool_timeout_seconds


def _goal_max_continuations() -> int:
    ov = _override("GOAL_MAX_CONTINUATIONS")
    if ov is not None:
        return ov
    return get_env_config().agent_tuning.vibe_trading_goal_max_continuations


def _coerce_usage_int(value: Any) -> int:
    """Coerce provider token counts to non-negative ints."""
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _normalize_llm_usage(usage: Any) -> dict[str, int] | None:
    """Normalize provider-reported usage metadata without estimating tokens."""
    if usage is None:
        return None
    if not isinstance(usage, dict):
        try:
            usage = dict(usage)
        except (TypeError, ValueError):
            return None

    input_tokens = _coerce_usage_int(usage.get("input_tokens"))
    output_tokens = _coerce_usage_int(usage.get("output_tokens"))
    total_tokens = _coerce_usage_int(usage.get("total_tokens"))
    if total_tokens == 0 and (input_tokens or output_tokens):
        total_tokens = input_tokens + output_tokens
    if not (input_tokens or output_tokens or total_tokens):
        return None
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _new_llm_usage_summary(llm: Any) -> dict[str, Any]:
    """Create the run-scoped provider usage accumulator."""
    cfg = get_env_config()
    provider = cfg.llm.langchain_provider.strip() or "openai"
    model = getattr(llm, "model_name", None) or cfg.llm.langchain_model_name.strip()
    return {
        "provider": provider,
        "model": model,
        "totals": {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "calls": 0,
        },
        "per_iteration": [],
    }


def _record_llm_usage(
    run_dir: Path,
    summary: dict[str, Any],
    usage: Any,
    iteration: int,
) -> dict[str, int] | None:
    """Accumulate and persist one provider-reported usage event."""
    normalized = _normalize_llm_usage(usage)
    if normalized is None:
        return None

    totals = summary.setdefault("totals", {})
    totals["input_tokens"] = int(totals.get("input_tokens") or 0) + normalized["input_tokens"]
    totals["output_tokens"] = int(totals.get("output_tokens") or 0) + normalized["output_tokens"]
    totals["total_tokens"] = int(totals.get("total_tokens") or 0) + normalized["total_tokens"]
    totals["calls"] = int(totals.get("calls") or 0) + 1
    summary.setdefault("per_iteration", []).append({"iter": iteration, **normalized})
    summary["updated_at"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    try:
        path = run_dir / LLM_USAGE_ARTIFACT
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        tmp_path.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        tmp_path.replace(path)
    except OSError as exc:
        logger.debug("LLM usage artifact write skipped: %s", exc)

    return normalized


def _redact_trace_result(result: str) -> str:
    """Redact structured sensitive fields before persisting trace/event previews.

    Args:
        result: Raw tool result string.

    Returns:
        Redacted JSON string when ``result`` is JSON, otherwise the original
        text. Plain text is left unchanged because reliable free-text secret
        scrubbing would be more error-prone than helpful here.
    """
    try:
        payload = json.loads(result)
    except (TypeError, json.JSONDecodeError):
        return result
    return json.dumps(redact_payload(payload), ensure_ascii=False)


def _format_timeout(seconds: float) -> str:
    """Return a human-readable timeout label."""
    if seconds < 1:
        return f"{seconds:.2f}s"
    return f"{seconds:.0f}s"


def estimate_tokens(messages: list) -> int:
    """Rough token count estimate (~4 chars/token).

    Args:
        messages: Message list.

    Returns:
        Estimated token count.
    """
    return len(json.dumps(messages, default=str, ensure_ascii=False)) // 4


def _microcompact(messages: list) -> None:
    """Layer 1: silently prune old tool results, keeping the most recent N intact.

    Args:
        messages: Message list (mutated in place).
    """
    tool_msgs = [m for m in messages if m.get("role") == "tool"]
    if len(tool_msgs) <= KEEP_RECENT:
        return
    for msg in tool_msgs[:-KEEP_RECENT]:
        content = msg.get("content", "")
        if isinstance(content, str) and len(content) > 100:
            msg["content"] = "[cleared]"


def _context_collapse(messages: list) -> None:
    """Layer 2: fold long text blocks in older messages without LLM call.

    Preserves head + tail of large text, collapses the middle.
    Zero API cost — pure string operation.

    Args:
        messages: Message list (mutated in place).
    """
    if len(messages) <= COLLAPSE_PRESERVE_RECENT + 1:
        return
    for msg in messages[1:-COLLAPSE_PRESERVE_RECENT]:
        content = msg.get("content")
        if not isinstance(content, str) or len(content) <= COLLAPSE_TEXT_MIN:
            continue
        if content == "[cleared]":
            continue
        head = content[:COLLAPSE_HEAD]
        tail = content[-COLLAPSE_TAIL:]
        trimmed = len(content) - COLLAPSE_HEAD - COLLAPSE_TAIL
        msg["content"] = f"{head}\n\n...[{trimmed} chars collapsed]...\n\n{tail}"


def _fix_tool_pairs(messages: list) -> None:
    """Repair orphaned tool_call / tool_result pairs after compression.

    Two fixes:
      1. Remove tool results whose matching tool_call was compressed away.
      2. Insert stub results for tool_calls whose results were compressed away.

    Args:
        messages: Message list (mutated in place).
    """
    call_ids: set[str] = set()
    for msg in messages:
        if msg.get("role") == "assistant":
            for tc in msg.get("tool_calls", []):
                tc_id = tc.get("id", "")
                if tc_id:
                    call_ids.add(tc_id)

    i = 0
    while i < len(messages):
        msg = messages[i]
        if msg.get("role") == "tool" and msg.get("tool_call_id") not in call_ids:
            messages.pop(i)
        else:
            i += 1

    result_ids: set[str] = set()
    for msg in messages:
        if msg.get("role") == "tool":
            tcid = msg.get("tool_call_id", "")
            if tcid:
                result_ids.add(tcid)

    inserts: list[tuple[int, dict]] = []
    for idx, msg in enumerate(messages):
        if msg.get("role") != "assistant":
            continue
        for tc in msg.get("tool_calls", []):
            tc_id = tc.get("id", "")
            if tc_id and tc_id not in result_ids:
                stub = {
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "name": tc.get("function", {}).get("name", "unknown"),
                    "content": "[Result from earlier context — see summary above]",
                }
                inserts.append((idx + 1, stub))
                result_ids.add(tc_id)

    for pos, stub in reversed(inserts):
        messages.insert(pos, stub)


def _attach_tool_call_thought_signatures(message: dict[str, Any], tool_calls: list) -> dict[str, Any]:
    """Attach Gemini thought signatures to assistant replay tool calls.

    The replay message is later converted back into LangChain messages from a
    plain dict history. Keep signatures in both the provider-neutral
    ``extra_content.thought_signature`` slot and Gemini's OpenAI-compatible
    ``extra_content.google.thought_signature`` slot so both local replay tests
    and the Gemini request injector can recover the value.
    """
    outbound_tool_calls = message.get("tool_calls")
    if not isinstance(outbound_tool_calls, list):
        return message

    signatures_by_id: dict[str, str] = {}
    signatures_by_index: dict[int, str] = {}
    for index, tc in enumerate(tool_calls):
        extra_content = getattr(tc, "extra_content", None)
        signature = None
        if isinstance(extra_content, dict):
            signature = extra_content.get("thought_signature")
            google_extra = extra_content.get("google")
            if not signature and isinstance(google_extra, dict):
                signature = google_extra.get("thought_signature") or google_extra.get(
                    "thoughtSignature"
                )
        signature = signature or getattr(tc, "thought_signature", None)
        if not signature:
            continue
        tc_id = getattr(tc, "id", None)
        if tc_id:
            signatures_by_id[str(tc_id)] = signature
        signatures_by_index[index] = signature

    if not signatures_by_id and not signatures_by_index:
        return message

    def attach(raw_tool_call: Any, index: int) -> None:
        if not isinstance(raw_tool_call, dict):
            return
        signature = signatures_by_id.get(str(raw_tool_call.get("id"))) or signatures_by_index.get(index)
        if not signature:
            return
        extra_content = raw_tool_call.setdefault("extra_content", {})
        if not isinstance(extra_content, dict):
            extra_content = {}
            raw_tool_call["extra_content"] = extra_content
        extra_content["thought_signature"] = signature
        google = extra_content.setdefault("google", {})
        if not isinstance(google, dict):
            google = {}
            extra_content["google"] = google
        google["thought_signature"] = signature

    for index, raw_tool_call in enumerate(outbound_tool_calls):
        attach(raw_tool_call, index)

    additional_kwargs = message.setdefault("additional_kwargs", {})
    raw_tool_calls = additional_kwargs.setdefault(
        "tool_calls",
        copy.deepcopy(outbound_tool_calls),
    )
    if isinstance(raw_tool_calls, list):
        for index, raw_tool_call in enumerate(raw_tool_calls):
            attach(raw_tool_call, index)

    return message


_STRUCTURED_SUMMARY_PROMPT = """\
Summarize this conversation for handoff to a fresh context window.
This summary is the ONLY context available — omitted information is lost.

Use EXACTLY this structure:

## Goal
What the user is trying to accomplish.

## Constraints & Preferences
User-stated requirements: risk tolerance, strategy parameters, asset preferences.

## Progress
### Done
- Completed steps with key results and specific numbers.
### In Progress
- Current work when compression triggered.

## Key Decisions
Choices made and rationale.

## Resolved Questions
Questions already answered — do NOT re-answer these.

## Pending User Asks
Unfinished requests still needing action.

## Relevant Files
File paths, run_dir, signal engines, artifact locations.

## Remaining Work
What still needs to be done (background reference, NOT active instructions).

## Critical Context
Specific numbers, parameters, error messages, configuration values.

## Tools & Patterns
Which tools worked, what failed, effective approaches.

IMPORTANT: This is a handoff — background reference, NOT active instructions.
Preserve ALL specific numbers, file paths, and parameter values.
{focus_section}
Conversation to summarize:
"""

_FOCUS_SECTION = """
FOCUS TOPIC: {topic}
Allocate 60-70% of the summary budget to content related to this topic.
Aggressively compress unrelated content to make room.
"""

_ITERATIVE_UPDATE_PROMPT = """\
Update the existing summary with new conversation turns.

PREVIOUS SUMMARY:
{previous_summary}

NEW TURNS TO INCORPORATE:
{new_turns}

Rules:
- PRESERVE all existing information from the previous summary.
- ADD new progress, decisions, and findings.
- Move "In Progress" items to "Done" when completed.
- Move answered questions to "Resolved Questions".
- Keep the same section structure.
- Do NOT drop any critical context from the previous summary.
{focus_section}"""


def _is_tool_success(result: str) -> bool:
    """Return True if the tool result does not look like an error response."""
    try:
        data = json.loads(result)
        if isinstance(data, dict) and data.get("status") == "error":
            return False
    except (json.JSONDecodeError, TypeError):
        pass
    return True


def _normalize_tool_run_dir(args: dict[str, Any], memory_run_dir: str | None) -> dict[str, Any]:
    """Normalize ``run_dir`` in tool args to an absolute path when possible.

    If the model supplies a relative ``run_dir`` (for example ``"."`` or
    ``"risk_parity_run"``), resolve it against the active run directory.
    """

    normalized = dict(args)
    if not memory_run_dir:
        return normalized

    if "run_dir" not in normalized:
        normalized["run_dir"] = memory_run_dir
        return normalized

    run_dir_value = str(normalized["run_dir"]).strip()
    if not run_dir_value:
        normalized["run_dir"] = memory_run_dir
        return normalized

    candidate = Path(run_dir_value)
    if not candidate.is_absolute():
        normalized["run_dir"] = str((Path(memory_run_dir) / candidate).resolve())
    return normalized