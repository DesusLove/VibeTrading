"""Swarm Worker: standalone worker execution engine with a lightweight ReAct loop.

Uses ChatLLM.chat + manual for-loop directly (without instantiating AgentLoop),
keeping the worker self-contained and the agent core unchanged.
"""


from collections.abc import Callable
import json
import logging
import time
from pathlib import Path

from src.agent.context import ContextBuilder
from src.agent.progress import HeartbeatTimer
from src.agent.skills import SkillsLoader
from src.config.schema import AgentConfig
from src.providers.chat import ChatLLM, LLMResponse, ProviderStreamError
from src.providers.content_filter import (
    CONTENT_FILTER_SKIP_MESSAGE,
    MAX_CONSECUTIVE_CONTENT_FILTER_SKIPS,
    compute_content_filter_warnings,
)
from src.swarm.models import (
    SwarmAgentSpec,
    SwarmEvent,
    SwarmTask,
    WorkerResult,
)
from src.tools import build_swarm_registry

# Re-export symbols moved to sub-modules for backward compatibility.
from src.swarm.worker_prompt import (  # noqa: F401
    _default_max_iterations,
    _default_timeout_seconds,
    _heartbeat_interval_s,
    _stream_retry_delay_s,
    _emit,
    _filter_skill_descriptions,
    _estimate_tokens,
    build_worker_prompt,
)
from src.swarm.worker_report import (  # noqa: F401
    _best_summary,
    _remote_tool_metadata,
    _preview_tool_arguments,
    _preview_tool_result,
    _truncate_preview,
    _report_written,
    _is_data_agent,
    _is_error_result,
    _classify_deliverable,
    _resolve_summary,
    _persist_messages,
    _write_summary,
    _collect_artifacts,
)


logger = logging.getLogger(__name__)

_HEARTBEAT_INTERVAL_S = _heartbeat_interval_s()
_STREAM_RETRY_DELAY_S = _stream_retry_delay_s()
_MAX_TOKEN_ESTIMATE = 60_000


def run_worker(
    agent_spec: SwarmAgentSpec,
    task: SwarmTask,
    upstream_summaries: dict[str, str],
    user_vars: dict[str, str],
    run_dir: Path,
    event_callback: Callable[[SwarmEvent], None] | None = None,
    include_shell_tools: bool = False,
    grounding_block: str = "",
    agent_config: AgentConfig | None = None,
) -> WorkerResult:
    """Execute a single worker task using a lightweight ReAct loop.

    Steps:
      1. Build filtered ToolRegistry from agent_spec.tools
      2. Create ChatLLM with agent_spec.model_name
      3. Build system prompt with role + upstream summaries + filtered skills
      4. Resolve task.prompt_template with user_vars
      5. Run ReAct loop (for iteration in range(max_iterations))
      6. Write summary to artifacts/{agent_id}/summary.md
      7. Return WorkerResult

    Args:
        agent_spec: Agent role specification with tools/skills/model config.
        task: The task to execute, including prompt template.
        upstream_summaries: Summaries from upstream tasks keyed by input_from keys.
        user_vars: User-provided variables for template rendering.
        run_dir: Path to .swarm/runs/{run_id}/ directory.
        event_callback: Optional callback for swarm events.
        include_shell_tools: Whether this worker may register shell tools.
        grounding_block: Optional pre-rendered "Ground Truth" markdown that
            anchors the worker on real recent prices for symbols mentioned in
            ``user_vars``. Forwarded verbatim to :func:`build_worker_prompt`.
        agent_config: Optional resolved agent config carrying remote MCP
            server definitions. Threaded from :class:`SwarmRuntime` and
            consumed by :func:`build_swarm_registry` to merge remote MCP
            tools with the local-tool pool before applying the agent's
            whitelist. ``None`` preserves the prior local-only behavior.

    Returns:
        WorkerResult with status, summary, artifacts, and iteration count.
    """
    agent_id = agent_spec.id
    task_id = task.id
    max_iterations = agent_spec.max_iterations or _default_max_iterations()
    timeout = agent_spec.timeout_seconds or _default_timeout_seconds()

    _emit(event_callback, "worker_started", agent_id, task_id)

    # 1. Build per-worker tool registry — local pool plus any operator-
    #    surfaced MCP tools, projected onto the agent's whitelist.
    registry = build_swarm_registry(
        agent_spec.tools,
        agent_config=agent_config,
        include_shell_tools=include_shell_tools,
    )

    # 2. Create LLM
    llm = ChatLLM(model_name=agent_spec.model_name)

    # 3. Build system prompt with filtered skills
    skills_loader = SkillsLoader()
    skill_desc = _filter_skill_descriptions(skills_loader, agent_spec.skills)
    system_prompt = build_worker_prompt(
        agent_spec, upstream_summaries, skill_desc, grounding_block=grounding_block,
    )

    # 4. Resolve prompt template with user vars (missing vars → LLM infers)
    class _FallbackDict(dict):
        """Dict that hints LLM to infer missing template variables."""
        def __missing__(self, key: str) -> str:
            return f"(determine the appropriate {key} based on the objective)"

    template_vars = _FallbackDict(user_vars)

    try:
        user_prompt = task.prompt_template.format_map(_FallbackDict(template_vars))
    except (KeyError, ValueError) as exc:
        error_msg = f"Failed to render prompt template: {exc}"
        _emit(event_callback, "worker_failed", agent_id, task_id, {"error": error_msg})
        return WorkerResult(
            status="failed", summary="", iterations=0, error=error_msg,
            input_tokens=0, output_tokens=0,
        )

    # 5. Build initial messages
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # 6. ReAct loop
    artifact_dir = run_dir / "artifacts" / agent_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.monotonic()
    iteration = 0
    summary = ""
    total_input_tokens = 0
    total_output_tokens = 0

    # Threshold for injecting a "wrap up" nudge (80% of budget)
    wrap_up_at = max(1, int(max_iterations * 0.8))
    last_assistant_content = ""

    _KEEP_RECENT_TOOLS = 3
    data_tool_calls = 0
    content_filter_count = 0
    consecutive_content_filter_count = 0

    for iteration in range(max_iterations):
        # Microcompact: clear old tool results to prevent token bloat
        tool_msgs = [m for m in messages if m.get("role") == "tool"]
        if len(tool_msgs) > _KEEP_RECENT_TOOLS:
            for msg in tool_msgs[:-_KEEP_RECENT_TOOLS]:
                content = msg.get("content", "")
                if isinstance(content, str) and len(content) > 100:
                    msg["content"] = "[cleared]"

        # Check timeout
        elapsed = time.monotonic() - t0
        if elapsed > timeout:
            summary = _best_summary(messages, last_assistant_content) or f"Worker timed out after {elapsed:.0f}s ({iteration} iterations)"
            summary = _resolve_summary(artifact_dir, summary)
            _emit(event_callback, "worker_timeout", agent_id, task_id, {"elapsed": elapsed})
            _write_summary(artifact_dir, summary)
            _persist_messages(artifact_dir, messages)
            return WorkerResult(
                status="timeout",
                summary=summary,
                artifact_paths=_collect_artifacts(artifact_dir),
                iterations=iteration,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                content_filter_warnings=compute_content_filter_warnings(
                    content_filter_count, iteration + 1,
                ),
            )

        # Check token estimate
        token_estimate = len(json.dumps(messages, ensure_ascii=False)) // 4
        if token_estimate > _MAX_TOKEN_ESTIMATE:
            summary = last_assistant_content or f"Worker context too large (~{token_estimate} tokens, {iteration} iterations)"
            summary = _resolve_summary(artifact_dir, summary)
            _emit(event_callback, "worker_token_limit", agent_id, task_id, {"tokens": token_estimate})
            _write_summary(artifact_dir, summary)
            return WorkerResult(
                status="token_limit",
                summary=summary,
                artifact_paths=_collect_artifacts(artifact_dir),
                iterations=iteration,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                content_filter_warnings=compute_content_filter_warnings(
                    content_filter_count, iteration + 1,
                ),
            )

        # Inject wrap-up nudge when approaching iteration limit
        if iteration == wrap_up_at:
            remaining = max_iterations - iteration
            messages.append({
                "role": "user",
                "content": (
                    f"[SYSTEM] You have {remaining} iterations remaining. "
                    "If report.md is not written yet, make one final write_file call for report.md. "
                    "Otherwise stop calling tools and output your final analysis summary as plain text."
                ),
            })

        # On last iteration, call LLM without tool definitions to force text output
        is_last_iteration = iteration == max_iterations - 1
        tool_defs = None if is_last_iteration else registry.get_definitions()

        # Stream the LLM — moonshot/kimi non-streaming invoke is unreliable
        # (issue #42), and streaming also feeds dashboard live progress.
        try:
            def _on_text_chunk(delta: str) -> None:
                _emit(event_callback, "worker_text", agent_id, task_id,
                      {"content": delta, "iteration": iteration})

            # LLM streaming can stall for 30s+ between request start and the
            # first text chunk (slow first-token providers, reasoning models'
            # think phase, pure-tool-call responses with no text). Without a
            # ticker, the stale-run reaper would mark a healthy run failed
            # the moment its silence exceeds the heartbeat-based threshold.
            # Wrap the call in the same HeartbeatTimer used for tool execution
            # so events.jsonl gets a fresh entry every few seconds no matter
            # what the provider is doing.
            def _on_llm_heartbeat(payload: dict) -> None:
                _emit(
                    event_callback,
                    "task_heartbeat",
                    agent_id,
                    task_id,
                    {**payload, "iteration": iteration, "phase": "llm"},
                )

            def _stream_once() -> LLMResponse:
                """Run one heartbeat-wrapped streaming LLM call.

                Recomputes the remaining time budget at call time so the
                single retry after a stream failure never reuses a stale
                timeout.

                Returns:
                    Parsed ``LLMResponse`` from ``ChatLLM.stream_chat``.

                Raises:
                    ProviderStreamError: When provider streaming fails.
                """

                remaining_timeout = max(10, int(timeout - (time.monotonic() - t0)))
                with HeartbeatTimer(
                    tool_name=f"llm:{agent_spec.model_name or 'default'}",
                    interval=_HEARTBEAT_INTERVAL_S,
                    emit=_on_llm_heartbeat,
                ):
                    return llm.stream_chat(
                        messages,
                        tools=tool_defs,
                        timeout=remaining_timeout,
                        on_text_chunk=_on_text_chunk,
                    )

            # A transient mid-stream hiccup (connection reset) used to be
            # absorbed by ChatLLM's silent non-streaming fallback; it now
            # surfaces as ProviderStreamError, so retry the stream exactly
            # once before taking the existing failure path. Deterministic
            # 4xx errors skip the retry and fail immediately.
            try:
                response = _stream_once()
            except ProviderStreamError as stream_exc:
                if not stream_exc.retryable:
                    raise
                logger.warning(
                    "Provider stream failed for agent=%s task=%s iteration=%d "
                    "(provider=%s model=%s); retrying once: %s",
                    agent_id,
                    task_id,
                    iteration,
                    stream_exc.provider,
                    stream_exc.model,
                    stream_exc,
                )
                time.sleep(_STREAM_RETRY_DELAY_S)
                response = _stream_once()
        except Exception as exc:
            error_msg = f"LLM call failed at iteration {iteration}: {exc}"
            logger.warning(error_msg)
            _emit(event_callback, "worker_failed", agent_id, task_id, {"error": error_msg})
            return WorkerResult(
                status="failed",
                summary=_resolve_summary(artifact_dir, last_assistant_content or ""),
                artifact_paths=_collect_artifacts(artifact_dir),
                iterations=iteration,
                error=error_msg,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                content_filter_warnings=compute_content_filter_warnings(
                    content_filter_count, iteration + 1,
                ),
            )

        # Accumulate token counts
        iter_in, iter_out = _estimate_tokens(messages, response)
        total_input_tokens += iter_in
        total_output_tokens += iter_out

        # Track last meaningful assistant content
        if response.content and len(response.content.strip()) > 20:
            last_assistant_content = response.content

        # Content-filter skip: provider blocked the response — continue to
        # the next iteration instead of finalising on empty/garbage content.
        if response.content_filter_triggered:
            content_filter_count += 1
            consecutive_content_filter_count += 1
            if consecutive_content_filter_count >= MAX_CONSECUTIVE_CONTENT_FILTER_SKIPS:
                _emit(
                    event_callback,
                    "content_filter_circuit_breaker",
                    agent_id,
                    task_id,
                    {"count": content_filter_count},
                )
                summary = _resolve_summary(artifact_dir, last_assistant_content or "")
                _write_summary(artifact_dir, summary)
                return WorkerResult(
                    status="failed",
                    summary=summary,
                    artifact_paths=_collect_artifacts(artifact_dir),
                    iterations=iteration + 1,
                    error=(
                        f"content_filter_circuit_breaker: "
                        f"{MAX_CONSECUTIVE_CONTENT_FILTER_SKIPS} consecutive "
                        "LLM responses were blocked by content moderation"
                    ),
                    input_tokens=total_input_tokens,
                    output_tokens=total_output_tokens,
                    content_filter_warnings=compute_content_filter_warnings(
                        content_filter_count, iteration + 1,
                    ),
                )
            _emit(
                event_callback,
                "content_filter_skipped",
                agent_id,
                task_id,
                {"iteration": iteration, "content_filter_count": content_filter_count},
            )
            messages.append({
                "role": "system",
                "content": CONTENT_FILTER_SKIP_MESSAGE,
            })
            continue

        consecutive_content_filter_count = 0

        # If no tool calls, this is the final response
        if not response.has_tool_calls:
            summary = response.content or last_assistant_content or "(no summary)"
            summary = _resolve_summary(artifact_dir, summary)
            _write_summary(artifact_dir, summary)
            reason = _classify_deliverable(
                summary,
                is_data_agent=_is_data_agent(agent_spec),
                report_written=_report_written(artifact_dir),
                data_tool_calls=data_tool_calls,
            )
            if reason:
                _emit(event_callback, "worker_incomplete", agent_id, task_id,
                      {"iterations": iteration + 1, "reason": reason})
                return WorkerResult(
                    status="incomplete",
                    summary=summary,
                    artifact_paths=_collect_artifacts(artifact_dir),
                    iterations=iteration + 1,
                    error=f"output contract not met: {reason}",
                    input_tokens=total_input_tokens,
                    output_tokens=total_output_tokens,
                    content_filter_warnings=compute_content_filter_warnings(
                        content_filter_count, iteration + 1,
                    ),
                )
            _emit(event_callback, "worker_completed", agent_id, task_id, {"iterations": iteration + 1})
            return WorkerResult(
                status="completed",
                summary=summary,
                artifact_paths=_collect_artifacts(artifact_dir),
                iterations=iteration + 1,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                content_filter_warnings=compute_content_filter_warnings(
                    content_filter_count, iteration + 1,
                ),
            )

        # Append assistant message with tool calls
        messages.append(
            ContextBuilder.format_assistant_tool_calls(
                response.tool_calls,
                content=response.content,
                reasoning_content=response.reasoning_content,
            )
        )

        # Execute each tool call — inject run_dir so tools write inside artifact_dir
        for tc in response.tool_calls:
            mcp_meta = _remote_tool_metadata(registry, tc.name)
            _emit(
                event_callback, "tool_call", agent_id, task_id,
                {"tool": tc.name, "iteration": iteration,
                 "arguments": _preview_tool_arguments(tc.arguments),
                 **mcp_meta},
            )
            tc_start = time.monotonic()
            args = {**tc.arguments, "run_dir": str(artifact_dir)}

            # Wrap tool execution in a heartbeat so the events.jsonl tail has a
            # fresh timestamp every few seconds. The stale-run reaper relies on
            # this signal to tell a hung tool call apart from a dead host; the
            # CLI dashboard / SSE clients also get live "still working" ticks.
            def _on_heartbeat(payload: dict) -> None:
                _emit(
                    event_callback,
                    "task_heartbeat",
                    agent_id,
                    task_id,
                    {**payload, "iteration": iteration, "phase": "tool"},
                )

            with HeartbeatTimer(
                tool_name=tc.name,
                interval=_HEARTBEAT_INTERVAL_S,
                emit=_on_heartbeat,
            ):
                result = registry.execute(tc.name, args)
            if tc.name != "load_skill" and not _is_error_result(result):
                data_tool_calls += 1
            tc_elapsed = time.monotonic() - tc_start
            _emit(
                event_callback, "tool_result", agent_id, task_id,
                {"tool": tc.name, "elapsed_ms": int(tc_elapsed * 1000),
                 "status": "ok", "iteration": iteration,
                  "result_preview": _preview_tool_result(result),
                 **mcp_meta},
            )
            messages.append(
                ContextBuilder.format_tool_result(tc.id, tc.name, result[:10_000])
            )

    # Content filter ratio tracking
    content_filter_warnings = compute_content_filter_warnings(
        content_filter_count, iteration + 1,
    )

    # Hit iteration limit — use last meaningful content as summary
    summary = _best_summary(messages, last_assistant_content) or f"Worker hit iteration limit ({max_iterations} iterations)"
    summary = _resolve_summary(artifact_dir, summary)
    _write_summary(artifact_dir, summary)
    _persist_messages(artifact_dir, messages)
    reason = _classify_deliverable(
        summary,
        is_data_agent=_is_data_agent(agent_spec),
        report_written=_report_written(artifact_dir),
        data_tool_calls=data_tool_calls,
    )
    if reason:
        _emit(event_callback, "worker_incomplete", agent_id, task_id,
              {"iterations": max_iterations, "reason": f"iteration limit; {reason}"})
        return WorkerResult(
            status="incomplete",
            summary=summary,
            artifact_paths=_collect_artifacts(artifact_dir),
            iterations=max_iterations,
            error=f"hit iteration limit without a valid deliverable: {reason}",
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            content_filter_warnings=content_filter_warnings,
        )
    _emit(event_callback, "worker_iteration_limit", agent_id, task_id)
    return WorkerResult(
        status="completed",
        summary=summary,
        artifact_paths=_collect_artifacts(artifact_dir),
        iterations=max_iterations,
        input_tokens=total_input_tokens,
        output_tokens=total_output_tokens,
        content_filter_warnings=content_filter_warnings,
    )