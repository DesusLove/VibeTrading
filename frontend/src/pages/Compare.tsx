import i18n from '@/i18n';
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GitCompare, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type RunListItem, type RunData, type EquityPoint } from "@/lib/api";
import { echarts, CHART_GROUP, connectCharts } from "@/lib/echarts";
import { getChartTheme } from "@/lib/chart-theme";
import { useDarkMode } from "@/hooks/useDarkMode";
import { SkeletonChart, SkeletonMetrics } from "@/components/common/Skeleton";

interface MetricDef {
  key: string;
  label: string;
  type: "pct" | "num" | "int" | "days";
  higherIsBetter: boolean;
}

function fmt(v: unknown, type: "pct" | "num" | "int" | "days" = "num"): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "\u2014";
  if (type === "pct") return (n * 100).toFixed(2) + "%";
  if (type === "int") return n.toFixed(0);
  if (type === "days") return n.toFixed(1);
  return n.toFixed(3);
}

function diffClass(a: unknown, b: unknown, higherIsBetter: boolean): string {
  const na = Number(a), nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return "";
  const better = higherIsBetter ? nb > na : nb < na;
  const worse = higherIsBetter ? nb < na : nb > na;
  return better ? "text-profit" : worse ? "text-loss" : "";
}

function diffStr(a: unknown, b: unknown, type: "pct" | "num" | "int" | "days"): string {
  const na = Number(a), nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return "\u2014";
  const d = nb - na;
  return (d > 0 ? "+" : "") + fmt(d, type);
}

function truncatePrompt(prompt: string | undefined, maxLen = 40): string {
  if (!prompt) return "";
  const trimmed = prompt.replace(/\n/g, " ").trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "\u2026" : trimmed;
}

function runLabel(r: RunListItem): string {
  const summary = truncatePrompt(r.prompt);
  if (summary) return summary;
  return r.run_id;
}

const METRICS: MetricDef[] = [
  { key: "total_return",           label: i18n.t("compare.totalReturn"),         type: "pct", higherIsBetter: true },
  { key: "annualized_return",      label: i18n.t("compare.annualizedReturn"),    type: "pct", higherIsBetter: true },
  { key: "sharpe",                 label: i18n.t("compare.sharpeRatio"),         type: "num", higherIsBetter: true },
  { key: "calmar_ratio",           label: i18n.t("compare.calmarRatio"),         type: "num", higherIsBetter: true },
  { key: "sortino_ratio",          label: i18n.t("compare.sortinoRatio"),        type: "num", higherIsBetter: true },
  { key: "max_drawdown",           label: i18n.t("compare.maxDrawdown"),         type: "pct", higherIsBetter: false },
  { key: "volatility",             label: i18n.t("compare.volatility"),           type: "pct", higherIsBetter: false },
  { key: "win_rate",               label: i18n.t("compare.winRate"),             type: "pct", higherIsBetter: true },
  { key: "profit_factor",          label: i18n.t("compare.profitFactor"),        type: "num", higherIsBetter: true },
  { key: "avg_win",                label: i18n.t("compare.avgWin"),              type: "pct", higherIsBetter: true },
  { key: "avg_loss",               label: i18n.t("compare.avgLoss"),             type: "pct", higherIsBetter: false },
  { key: "trade_count",            label: i18n.t("compare.trades"),               type: "int", higherIsBetter: true },
  { key: "max_consecutive_losses", label: i18n.t("compare.maxConsecLosses"),   type: "int", higherIsBetter: false },
  { key: "exposure_time",          label: i18n.t("compare.exposureTime"),        type: "pct", higherIsBetter: true },
  { key: "avg_holding_period",     label: i18n.t("compare.avgHoldingPeriod"),   type: "days", higherIsBetter: false },
];

// Also accept backend aliases
const METRIC_ALIASES: Record<string, string> = {
  annual_return: "annualized_return",
  calmar: "calmar_ratio",
  sortino: "sortino_ratio",
  profit_loss_ratio: "profit_factor",
  max_consec_loss: "max_consecutive_losses",
  max_consecutive_loss: "max_consecutive_losses",
  avg_hold_days: "avg_holding_period",
  avg_holding_days: "avg_holding_period",
};

function resolveMetric(metrics: Record<string, number> | null, key: string): number | undefined {
  if (!metrics) return undefined;
  if (metrics[key] !== undefined) return metrics[key];
  // Check if any alias maps to this key
  for (const [alias, canonical] of Object.entries(METRIC_ALIASES)) {
    if (canonical === key && metrics[alias] !== undefined) return metrics[alias];
  }
  return undefined;
}

interface EquityChartOverlayProps {
  leftCurve: EquityPoint[];
  rightCurve: EquityPoint[];
  leftLabel: string;
  rightLabel: string;
}

function EquityChartOverlay({ leftCurve, rightCurve, leftLabel, rightLabel }: EquityChartOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { dark } = useDarkMode();

  useEffect(() => {
    if (!ref.current) return;
    if (leftCurve.length === 0 && rightCurve.length === 0) return;

    const t = getChartTheme();
    const chart = echarts.init(ref.current);
    chart.group = CHART_GROUP;
    connectCharts();

    // Merge dates from both curves and sort
    const dateSet = new Set<string>();
    for (const p of leftCurve) dateSet.add(p.time);
    for (const p of rightCurve) dateSet.add(p.time);
    const dates = Array.from(dateSet).sort();

    // Build lookup maps
    const leftMap = new Map(leftCurve.map((p) => [p.time, Number(p.equity)]));
    const rightMap = new Map(rightCurve.map((p) => [p.time, Number(p.equity)]));

    const leftData = dates.map((d) => leftMap.get(d) ?? null);
    const rightData = dates.map((d) => rightMap.get(d) ?? null);

    const PRIMARY_COLOR = getComputedStyle(document.documentElement).getPropertyValue("--chart-compare-a").trim() || "#3b82f6";
    const SECONDARY_COLOR = getComputedStyle(document.documentElement).getPropertyValue("--chart-compare-b").trim() || "#f59e0b";

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params) || !params.length) return "";
          let html = `<b>${params[0].axisValue}</b>`;
          for (const p of params) {
            if (p.value == null) continue;
            html += `<br/>${p.marker} ${p.seriesName}: <b>${Number(p.value).toLocaleString()}</b>`;
          }
          return html;
        },
      },
      legend: {
        data: [leftLabel, rightLabel],
        textStyle: { color: t.textColor, fontSize: 11 },
        right: 8,
        top: 4,
      },
      grid: { left: 8, right: 8, top: 36, bottom: 40, containLabel: true },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: t.gridColor } },
        axisLabel: { color: t.textColor, fontSize: 10 },
      },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 4 }],
      series: [
        {
          name: leftLabel,
          type: "line",
          data: leftData,
          smooth: false,
          symbol: "none",
          lineStyle: { color: PRIMARY_COLOR, width: 2 },
          connectNulls: true,
        },
        {
          name: rightLabel,
          type: "line",
          data: rightData,
          smooth: false,
          symbol: "none",
          lineStyle: { color: SECONDARY_COLOR, width: 2 },
          connectNulls: true,
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current!);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [leftCurve, rightCurve, leftLabel, rightLabel, dark]);

  if (leftCurve.length === 0 && rightCurve.length === 0) return null;

  return <div ref={ref} style={{ height: 320 }} />;
}

export function Compare() {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [leftData, setLeftData] = useState<Record<string, number> | null>(null);
  const [rightData, setRightData] = useState<Record<string, number> | null>(null);
  const [leftCurve, setLeftCurve] = useState<EquityPoint[]>([]);
  const [rightCurve, setRightCurve] = useState<EquityPoint[]>([]);
  const [leftLoading, setLeftLoading] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);

  useEffect(() => {
    api.listRuns().then((items) => {
      setRuns(Array.isArray(items) ? items : []);
      if (items.length >= 2) { setLeftId(items[1].run_id); setRightId(items[0].run_id); }
      else if (items.length === 1) { setLeftId(items[0].run_id); }
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("compare.loadError"));
    });
  }, []);

  useEffect(() => {
    if (leftId) {
      setLeftLoading(true);
      api.getRun(leftId).then((d: RunData) => {
        setLeftData(d.metrics || null);
        setLeftCurve(d.equity_curve || []);
      }).catch((error) => {
        setLeftData(null);
        setLeftCurve([]);
        toast.error(error instanceof Error ? error.message : t("compare.loadError"));
      })
        .finally(() => setLeftLoading(false));
    } else {
      setLeftData(null);
      setLeftCurve([]);
    }
  }, [leftId]);

  useEffect(() => {
    if (rightId) {
      setRightLoading(true);
      api.getRun(rightId).then((d: RunData) => {
        setRightData(d.metrics || null);
        setRightCurve(d.equity_curve || []);
      }).catch((error) => {
        setRightData(null);
        setRightCurve([]);
        toast.error(error instanceof Error ? error.message : t("compare.loadError"));
      })
        .finally(() => setRightLoading(false));
    } else {
      setRightData(null);
      setRightCurve([]);
    }
  }, [rightId]);

  const leftRun = runs.find((r) => r.run_id === leftId);
  const rightRun = runs.find((r) => r.run_id === rightId);
  const loading = leftLoading || rightLoading;
  const hasData = Boolean(leftData || rightData);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div className="space-y-1">
          <div className="v2-badge-accent w-fit">
            <GitCompare className="h-3.5 w-3.5" />
            {t("compare.compare")}
          </div>
          <h1 className="page-header-title">{t("compare.title")}</h1>
          <p className="page-header-desc">{t("compare.subtitle")}</p>
        </div>
      </div>

      {/* Selectors */}
      <div className="premium-card p-5 animate-slide-up" style={{ animationDelay: "0.05s" }}>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] items-end">
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: 'hsl(var(--text-tertiary))' }}>{t("compare.baseline")}</span>
            <select value={leftId} onChange={(e) => setLeftId(e.target.value)} className="filter-select w-full" title={leftRun?.prompt || leftId}>
              <option value="">{t("compare.select")}</option>
              {runs.map((r) => <option key={r.run_id} value={r.run_id}>{runLabel(r)} ({r.status})</option>)}
            </select>
          </div>
          <ArrowRight className="hidden lg:block h-5 w-5 mb-2 justify-self-center shrink-0" style={{ color: 'hsl(var(--text-tertiary))' }} />
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: 'hsl(var(--text-tertiary))' }}>{t("compare.compare")}</span>
            <select value={rightId} onChange={(e) => setRightId(e.target.value)} className="filter-select w-full" title={rightRun?.prompt || rightId}>
              <option value="">{t("compare.select")}</option>
              {runs.map((r) => <option key={r.run_id} value={r.run_id}>{runLabel(r)} ({r.status})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Loading state  show skeletons while a selected run's data is in flight */}
      {loading && !hasData && (
        <div className="space-y-6 animate-fade-in">
          <div className="premium-card p-5">
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold block mb-3" style={{ color: 'hsl(var(--text-tertiary))' }}>{t("compare.equityDrawdown")}</span>
            <SkeletonChart height={320} />
          </div>
          <div className="premium-card overflow-hidden">
            <SkeletonMetrics />
          </div>
        </div>
      )}

      {/* Equity curve overlay */}
      {(leftCurve.length > 0 || rightCurve.length > 0) && (
        <div className="premium-card p-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <span className="text-[10px] uppercase tracking-[0.12em] font-semibold block mb-3" style={{ color: 'hsl(var(--text-tertiary))' }}>{t("compare.equityDrawdown")}</span>
          <EquityChartOverlay
            leftCurve={leftCurve}
            rightCurve={rightCurve}
            leftLabel={leftRun ? truncatePrompt(leftRun.prompt, 20) || "Baseline" : "Baseline"}
            rightLabel={rightRun ? truncatePrompt(rightRun.prompt, 20) || "Compare" : "Compare"}
          />
        </div>
      )}

      {/* Metrics table */}
      {(leftData || rightData) && (
        <div className="overflow-hidden rounded-xl animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <table className="table-premium">
            <thead>
              <tr>
                <th>{t("compare.metric")}</th>
                <th className="text-right">{t("compare.baselineCol")}</th>
                <th className="text-right">{t("compare.compareCol")}</th>
                <th className="text-right">{t("compare.delta")}</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map(({ key, label, type, higherIsBetter }) => {
                const lv = resolveMetric(leftData, key);
                const rv = resolveMetric(rightData, key);
                return (
                  <tr key={key}>
                    <td className="px-4 py-2.5 text-xs font-medium">{label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">{fmt(lv, type)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">{fmt(rv, type)}</td>
                    <td className={cn("px-4 py-2.5 text-right font-mono text-sm tabular-nums font-semibold", diffClass(lv, rv, higherIsBetter))}>{diffStr(lv, rv, type)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!hasData && !loading && (
        <div className="empty-state animate-scale-in">
          <GitCompare className="empty-state-icon" />
          <h2 className="empty-state-title">{t("compare.selectTwoRuns")}</h2>
        </div>
      )}
    </div>
  );
}
