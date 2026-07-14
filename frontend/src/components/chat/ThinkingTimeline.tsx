import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo, memo } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { localizeToolName } from "@/lib/tools";
import type { AgentMessage } from "@/types/agent";

interface Props {
  messages: AgentMessage[];
  isLatest?: boolean;
}

export const ThinkingTimeline = memo(function ThinkingTimeline({ messages, isLatest = false }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isLatest);

  const toolLabel = (tool?: string): string => {
    if (!tool) return t('thinking.processing');
    return localizeToolName(tool);
  };

  useEffect(() => {
    if (!isLatest) setExpanded(false);
  }, [isLatest]);

  const { steps, hasError, isRunning, totalMs, latestTool, latestThinking } = useMemo(() => {
    let totalMs = 0;
    let latestTool = "";
    let latestThinking = "";
    // Merge tool_call + tool_result pairs into "steps"
    const steps: Array<{ tool: string; label: string; status: "running" | "ok" | "error"; elapsed_ms?: number }> = [];

    for (const m of messages) {
      if (m.type === "thinking" && m.content) latestThinking = m.content;
      if (m.type === "tool_call") {
        steps.push({ tool: m.tool || "", label: toolLabel(m.tool), status: m.status === "running" ? "running" : "ok", elapsed_ms: undefined });
        if (m.status === "running") latestTool = m.tool || "";
      }
      if (m.type === "tool_result") {
        const existing = [...steps].reverse().find(s => s.tool === m.tool);
        if (existing) {
          existing.status = m.status === "ok" ? "ok" : "error";
          existing.elapsed_ms = m.elapsed_ms;
        }
        if (m.elapsed_ms) totalMs += m.elapsed_ms;
      }
    }

    return {
      steps,
      hasError: steps.some(s => s.status === "error"),
      isRunning: steps.some(s => s.status === "running"),
      totalMs,
      latestTool,
      latestThinking,
    };
  }, [messages]);

  const stepCount = steps.length;
  const summaryText = isRunning
    ? `${t('thinking.running')} ${toolLabel(latestTool)}...`
    : `${t('thinking.done')} · ${t('thinking.steps', { count: stepCount })}${totalMs > 0 ? ` · ${(totalMs / 1000).toFixed(1)}s` : ""}`;

  return (
    <div className="v2-card-depth-1 overflow-hidden">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-surface-muted"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: 'hsl(var(--text-tertiary))' }} />
          : <ChevronRight className="h-3 w-3 shrink-0" style={{ color: 'hsl(var(--text-tertiary))' }} />}
        {isRunning ? (
          <Loader2 className="h-3 w-3 text-guru animate-spin shrink-0" />
        ) : hasError ? (
          <XCircle className="h-3 w-3 text-negative shrink-0" />
        ) : (
          <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: 'hsl(var(--positive) / 0.7)' }} />
        )}
        <span className={cn(isRunning && "text-text-primary")} style={{ color: !isRunning ? 'hsl(var(--text-secondary))' : undefined }}>
          {summaryText}
        </span>
      </button>

      {/* Thinking preview when running but collapsed */}
      {!expanded && isRunning && latestThinking && (
        <div className="px-3 pb-2 -mt-1">
          <p className="text-[11px] italic line-clamp-1 pl-5" style={{ color: 'hsl(var(--text-tertiary) / 0.4)' }}>
            {latestThinking.slice(-100)}
          </p>
        </div>
      )}

      {/* Expanded step list */}
      {expanded && steps.length > 0 && (
        <div className="border-t px-3 py-1.5 space-y-0.5" style={{ borderColor: 'hsl(var(--border-hairline) / 0.6)' }}>
          {steps.map((step, i) => (
            <div key={`${step.tool}-${i}`} className="flex items-center gap-2 py-1 text-xs">
              <span className="shrink-0 w-3 text-center" style={{ color: 'hsl(var(--border-hairline) / 0.6)' }}>
                {i < steps.length - 1 ? "├" : "└"}
              </span>
              {step.status === "running" ? (
                <Loader2 className="h-3 w-3 text-guru animate-spin shrink-0" />
              ) : step.status === "error" ? (
                <XCircle className="h-3 w-3 text-negative shrink-0" />
              ) : (
                <Circle className="h-3 w-3 shrink-0" fill="currentColor" style={{ color: 'hsl(var(--positive) / 0.5)' }} />
              )}
              <span className={cn(
                "flex-1",
                step.status === "running" && "text-text-primary"
              )} style={{ color: step.status !== "running" ? 'hsl(var(--text-secondary) / 0.6)' : undefined }}>
                {step.label}
              </span>
              {step.status === "running" ? (
                <span className="text-[10px]" style={{ color: 'hsl(var(--accent-primary) / 0.6)' }}>{t('thinking.running')}</span>
              ) : step.elapsed_ms != null ? (
                <span className="text-[10px] tabular-nums" style={{ color: 'hsl(var(--text-tertiary) / 0.4)' }}>{(step.elapsed_ms / 1000).toFixed(1)}s</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Expanded: show thinking content if any (for Q&A without tools) */}
      {expanded && steps.length === 0 && latestThinking && (
        <div className="border-t px-3 py-2" style={{ borderColor: 'hsl(var(--border-hairline) / 0.6)' }}>
          <p className="text-xs leading-relaxed line-clamp-4" style={{ color: 'hsl(var(--text-secondary) / 0.5)' }}>
            {latestThinking}
          </p>
        </div>
      )}
    </div>
  );
});
