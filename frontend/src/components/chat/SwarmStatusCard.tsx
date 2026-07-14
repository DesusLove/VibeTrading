import { useTranslation } from 'react-i18next';
import { memo } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import { ProgressBar } from "@/components/chat/ProgressBar";
import { localizeToolName } from "@/lib/tools";
import type { SwarmAgentDisplayStatus, SwarmRunStatus } from "@/types/agent";

interface Props {
  status: SwarmRunStatus;
}

function formatElapsed(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function statusTone(status: SwarmAgentDisplayStatus): string {
  switch (status) {
    case "done":
      return "bg-positive/10 text-positive";
    case "failed":
      return "bg-negative/10 text-negative";
    case "blocked":
      return "bg-warning/10 text-warning";
    case "retry":
      return "bg-info/10 text-info";
    case "running":
      return "bg-accent/10 text-accent";
    case "cancelled":
      return "bg-surface-muted text-text-tertiary";
    case "waiting":
    default:
      return "bg-surface-muted text-text-tertiary";
  }
}

function StatusIcon({ status }: { status: SwarmAgentDisplayStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-3 w-3" />;
    case "failed":
      return <XCircle className="h-3 w-3" />;
    case "blocked":
      return <ShieldAlert className="h-3 w-3" />;
    case "retry":
      return <RotateCcw className="h-3 w-3" />;
    case "running":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case "cancelled":
      return <XCircle className="h-3 w-3" />;
    case "waiting":
    default:
      return <Circle className="h-3 w-3" />;
  }
}

function runTone(status: SwarmRunStatus["status"]): string {
  switch (status) {
    case "completed":
      return "text-positive";
    case "failed":
      return "text-negative";
    case "cancelled":
      return "text-text-tertiary";
    case "running":
      return "text-guru";
    case "pending":
    case "unknown":
    default:
      return "text-text-tertiary";
  }
}

export const SwarmStatusCard = memo(function SwarmStatusCard({ status }: Props) {
  const { t } = useTranslation();
  const done = status.agents.filter((agent) => ["done", "failed", "blocked", "cancelled"].includes(agent.status)).length;
  const total = status.agents.length;
  const layerTotal = Math.max(status.totalLayers, status.currentLayer + 1, 1);
  const layerCurrent = Math.min(status.currentLayer + 1, layerTotal);

  return (
    <div className="v2-card-depth-1 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-3.5 w-3.5 shrink-0 text-guru" />
          <span className="truncate text-xs font-semibold text-text-primary">{status.preset}</span>
          <span className={["shrink-0 text-[10px] font-medium capitalize", runTone(status.status)].join(" ")}>
            {status.status.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary shrink-0">
          <Clock className="h-2.5 w-2.5" />
          <span className="num-2xs">{t('swarmStatus.agents', { done, total: total || 0 })}</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
        <ProgressBar
          current={total ? done : 0}
          total={Math.max(total, 1)}
          height="xs"
          showCount
          ariaLabel="Swarm agent progress"
        />
        <div className="text-right num-2xs text-text-tertiary">
          {t('swarmStatus.layer', { current: layerCurrent, total: layerTotal })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[10rem_7rem_9rem_5rem_4rem_minmax(0,1fr)] gap-2 border-b border-border-hairline pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              <span>{t('swarmStatus.agent')}</span>
              <span>{t('swarmStatus.status')}</span>
              <span>{t('swarmStatus.tool')}</span>
              <span className="text-right">{t('swarmStatus.time')}</span>
              <span className="text-right">{t('swarmStatus.iters')}</span>
              <span>{t('swarmStatus.output')}</span>
            </div>
            <div className="divide-y divide-border-hairline">
              {status.agents.map((agent) => (
                <div
                  key={`${agent.taskId || agent.agentId}`}
                  className="grid grid-cols-[10rem_7rem_9rem_5rem_4rem_minmax(0,1fr)] gap-2 py-1.5 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-primary">{agent.agentId}</div>
                    {agent.role && <div className="truncate text-[10px] text-text-tertiary">{agent.role}</div>}
                  </div>
                  <div>
                    <span className={["inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium", statusTone(agent.status)].join(" ")}>
                      <StatusIcon status={agent.status} />
                      {agent.status}
                    </span>
                  </div>
                  <div className="truncate num-xs text-text-secondary" title={agent.tool || ""}>
                    {agent.tool ? localizeToolName(agent.tool, agent.tool) : "-"}
                  </div>
                  <div className="text-right num-xs text-text-secondary">
                    {formatElapsed(agent.elapsed_s)}
                  </div>
                  <div className="text-right num-xs text-text-secondary">
                    {agent.iterations ?? "-"}
                  </div>
                  <div className={["truncate text-[11px]", agent.error ? "text-negative" : "text-text-secondary"].join(" ")} title={agent.error || agent.lastText || ""}>
                    {agent.error || agent.lastText || "-"}
                  </div>
                </div>
              ))}
              {status.agents.length === 0 && (
                <div className="py-2 text-xs text-text-secondary">
                  {t('swarmStatus.waitingForEvents')}
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
});
