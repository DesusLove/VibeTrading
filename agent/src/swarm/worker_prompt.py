"""Worker prompt helpers — extracted from worker.py for modularity."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
import json
import logging

from src.agent.skills import SkillsLoader
from src.providers.chat import LLMResponse
from src.swarm.models import SwarmAgentSpec, SwarmEvent


logger = logging.getLogger(__name__)


def _default_max_iterations() -> int:
    from src.config.accessor import get_env_config

    return get_env_config().swarm.swarm_worker_max_iter


def _default_timeout_seconds() -> int:
    from src.config.accessor import get_env_config

    return get_env_config().swarm.swarm_worker_timeout


def _heartbeat_interval_s() -> float:
    from src.config.accessor import get_env_config

    return get_env_config().swarm.swarm_heartbeat_interval_s


def _stream_retry_delay_s() -> float:
    from src.config.accessor import get_env_config

    return get_env_config().swarm.swarm_stream_retry_delay_s


def _emit(
    callback: Callable[[SwarmEvent], None] | None,
    event_type: str,
    agent_id: str,
    task_id: str,
    data: dict | None = None,
) -> None:
    if callback is None:
        return
    event = SwarmEvent(
        type=event_type,
        agent_id=agent_id,
        task_id=task_id,
        data=data or {},
        timestamp=datetime.now(UTC).isoformat(),
    )
    try:
        callback(event)
    except Exception:
        logger.warning("Event callback failed for %s", event_type, exc_info=True)


def _filter_skill_descriptions(loader: SkillsLoader, skill_names: list[str]) -> str:
    if not skill_names:
        return loader.get_descriptions()
    lines: list[str] = []
    for skill in loader.skills:
        if skill.name in skill_names:
            lines.append(f"  - {skill.name}: {skill.description}")
    return "\n".join(lines) if lines else "(no matching skills)"


def _estimate_tokens(
    messages: list[dict],
    response: object,
) -> tuple[int, int]:
    if isinstance(response, LLMResponse) and response.usage_metadata:
        usage = response.usage_metadata
        real_input = int(usage.get("input_tokens") or 0)
        real_output = int(usage.get("output_tokens") or 0)
        if real_input or real_output:
            return real_input, real_output

    try:
        input_tokens = len(json.dumps(messages, ensure_ascii=False)) // 4
    except Exception:
        input_tokens = 0

    if isinstance(response, LLMResponse):
        output_tokens = len(response.content or "") // 4
    else:
        output_tokens = 0

    return input_tokens, output_tokens


def build_worker_prompt(
    agent_spec: SwarmAgentSpec,
    upstream_summaries: dict[str, str],
    skill_descriptions: str,
    grounding_block: str = "",
) -> str:
    upstream_block = ""
    if upstream_summaries:
        sections = []
        for key, summary in upstream_summaries.items():
            sections.append(f"### {key}\n{summary}")
        upstream_block = (
            "## Upstream Context (from previous agents)\n\n"
            + "\n\n".join(sections)
        )

    prompt_parts = [
        f"## Role\n\n{agent_spec.role}",
        agent_spec.system_prompt.replace("{upstream_context}", upstream_block),
    ]

    if skill_descriptions and skill_descriptions != "(no matching skills)":
        prompt_parts.append(
            f"## Available Skills (use load_skill to access full documentation)\n\n{skill_descriptions}"
        )

    if grounding_block:
        prompt_parts.append(grounding_block)

    if "get_market_data" in (agent_spec.tools or []):
        prompt_parts.append(
            "## Market Data Tool Policy\n\n"
            "For OHLCV price bars, recent closes, volume, technical indicators, "
            "or return calculations, call `get_market_data` before writing raw "
            "provider scripts. It uses the repository loader layer, normalizes "
            "symbols, drops malformed OHLC rows, and returns strict JSON. Use "
            "raw yfinance scripts only for fields outside OHLCV coverage, such "
            "as fundamentals, holders, options, or corporate metadata."
        )

    prompt_parts.append(
        "## Data Citation Discipline (HARD RULE)\n\n"
        "Every specific number you cite in your output — prices, percentages, "
        "volumes, fund flows, market-cap rankings, sector weights, ETF codes, "
        "ticker recommendations — MUST be traceable to one of:\n"
        "  (a) a tool call result obtained in THIS run,\n"
        "  (b) the Ground Truth block above (if present),\n"
        "  (c) the Upstream Context above (if present and the upstream agent "
        "itself sourced it from (a) or (b)).\n\n"
        "You may NOT cite numbers from memory or training data. Markets have "
        "moved since your cutoff; any specific price/percentage you recall is "
        "wrong by default.\n\n"
        "If you cannot back a number with (a), (b), or (c), you have two "
        "choices:\n"
        "  - call a data tool to fetch it (preferred), or\n"
        "  - omit the number and qualify the statement (e.g. \"directional "
        "only — not verified against live data\").\n\n"
        "This rule applies equally to synthesis / aggregator / editor roles "
        "that lack data tools. If upstream did not provide a specific number, "
        "do NOT introduce one from training data — say the upstream omitted "
        "it and proceed without."
    )

    prompt_parts.append(
        "## Execution Rules\n\n"
        "You have a HARD LIMIT of 20 tool calls. After that you will be cut off. Work efficiently.\n\n"
        "**Phase 1 — Plan (0 tool calls):** Before calling any tool, state your plan in 3-5 bullet points.\n\n"
        "**Phase 2 — Execute (≤15 tool calls):**\n"
        "- `load_skill` first to get data access methods and analysis patterns.\n"
        "- Write ONE focused Python script via `write_file`, then run it with `bash python script.py`.\n"
        "- Do NOT write long Python code inside bash. Use write_file + bash.\n"
        "- Do NOT fetch data with curl/requests. Use the patterns from load_skill (yfinance, OKX API via Python).\n"
        "- If a script fails, read the error, fix with `edit_file`, re-run. Max 2 retries per script.\n\n"
        "**Phase 3 — Summarize (MUST use write_file):**\n"
        "- You MUST call `write_file` with path `report.md` to save your final report as a markdown file.\n"
        "- This is REQUIRED, not optional. Your final response MUST include a write_file call for report.md.\n"
        "- The report must include specific numbers, dates, and actionable conclusions.\n"
        "- After writing report.md, output a brief 2-3 sentence summary in your text response.\n"
        "- Respond in the same language as the task prompt."
    )

    now = datetime.now(UTC)
    prompt_parts.append(
        f"## Current Date & Time\n\n"
        f"Today is {now.strftime('%A, %B %d, %Y %H:%M UTC')}"
    )

    return "\n\n".join(prompt_parts)
