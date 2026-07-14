import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  GitCompare,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { api, type RunListItem } from "@/lib/api";
import { formatMetricVal } from "@/lib/formatters";


const REPORT_SCAN_LIMIT = 100;

type SortMode = "created_desc" | "created_asc" | "return_desc" | "sharpe_desc";

export function Reports() {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("created_desc");
  const [error, setError] = useState<string | null>(null);

  async function loadReports(mode: "initial" | "refresh" = "refresh") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const list = await api.listRuns(REPORT_SCAN_LIMIT);
      setRuns(Array.isArray(list) ? list.filter(isBacktestReportRun) : []);
    } catch (err) {
      setRuns([]);
      setError(err instanceof Error ? err.message : t("reports.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadReports("initial");
  }, []);

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(runs.map((run) => run.status || "unknown"))).sort();
    return ["all", ...values];
  }, [runs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const startMs = startDate ? Date.parse(startDate) : Number.NEGATIVE_INFINITY;
    const endMs = endDate ? Date.parse(`${endDate}T23:59:59`) : Number.POSITIVE_INFINITY;

    return [...runs]
      .filter((run) => {
        if (statusFilter !== "all" && (run.status || "unknown") !== statusFilter) return false;
        const created = Date.parse(run.created_at);
        if (Number.isFinite(created) && (created < startMs || created > endMs)) return false;
        if (!needle) return true;
        const haystack = [
          run.run_id,
          run.status,
          run.prompt,
          ...(run.codes || []),
          run.start_date,
          run.end_date,
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(needle);
      })
      .sort((left, right) => compareRuns(left, right, sortMode));
  }, [runs, query, statusFilter, startDate, endDate, sortMode]);

  return (
    <div className="min-h-screen p-6 lg:p-8 animate-fade-in">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="page-header animate-slide-up">
          <div className="space-y-3">
            <div className="v2-badge-accent">
              <FileText className="h-3.5 w-3.5" />
              {t("reports.badge")}
            </div>
            <div>
              <h1 className="page-header-title">{t("reports.title")}</h1>
              <p className="page-header-desc">{t("reports.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadReports("refresh")}
            disabled={refreshing}
            className="v2-btn-secondary"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("reports.refresh")}
          </button>
        </section>

        <section className="filter-bar animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <label className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'hsl(var(--text-tertiary))' }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("reports.searchPlaceholder")}
              className="filter-input w-full pl-9"
            />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="filter-select">
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? t("reports.allStatuses") : status}
              </option>
            ))}
          </select>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="filter-input" aria-label={t("reports.startDate")} />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="filter-input" aria-label={t("reports.endDate")} />
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="filter-select" aria-label={t("reports.sort")}>
            <option value="created_desc">{t("reports.sortNewest")}</option>
            <option value="created_asc">{t("reports.sortOldest")}</option>
            <option value="return_desc">{t("reports.sortReturn")}</option>
            <option value="sharpe_desc">{t("reports.sortSharpe")}</option>
          </select>
        </section>

        <div className="text-xs animate-fade-in" style={{ color: 'hsl(var(--text-secondary))', animationDelay: "0.12s" }}>
          {t("reports.count", { shown: filtered.length, total: runs.length })}
        </div>

        {loading ? (
          <div className="grid gap-3">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 skeleton-pulse animate-fade-in" style={{ animationDelay: `${item * 0.06}s` }} />
            ))}
          </div>
        ) : null}

        {!loading && error ? (
          <section className="error-state animate-fade-in">
            <div className="error-state-header">
              <AlertTriangle className="h-5 w-5" />
              {t("reports.unavailable")}
            </div>
            <p className="mt-2 text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>{error}</p>
          </section>
        ) : null}

        {!loading && !error && filtered.length === 0 ? (
          <section className="empty-state animate-scale-in">
            <FileText className="empty-state-icon" />
            <h2 className="empty-state-title">{runs.length === 0 ? t("reports.emptyTitle") : t("reports.noMatchesTitle")}</h2>
            <p className="empty-state-body">
              {runs.length === 0 ? t("reports.emptyBody") : t("reports.noMatchesBody")}
            </p>
          </section>
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <section className="grid gap-3">
            {filtered.map((run, idx) => (
              <ReportRow key={run.run_id} run={run} delay={0.15 + idx * 0.03} />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ReportRow({ run, delay = 0 }: { run: RunListItem; delay?: number }) {
  const { t } = useTranslation();
  return (
    <article className="v2-card-depth-1 p-4 animate-slide-up" style={{ animationDelay: `${delay}s` }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2.5 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            <Link to={`/runs/${run.run_id}`} className="truncate font-mono text-sm font-medium hover:text-guru transition-colors">
              {run.run_id}
            </Link>
            <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>{formatRunDate(run.created_at)}</span>
          </div>
          <p className="line-clamp-2 text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>{run.prompt || t("reports.noPrompt")}</p>
          <div className="flex flex-wrap gap-1.5">
            {(run.codes || []).slice(0, 6).map((code) => (
              <span key={code} className="v2-tag">{code}</span>
            ))}
            {run.start_date || run.end_date ? (
              <span className="v2-tag">{run.start_date || "?"} {t("reports.to")} {run.end_date || "?"}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end shrink-0">
          <div className="flex gap-2">
            <div className="rounded-md px-3 py-1.5 text-right v2-card-depth-1">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--text-tertiary))' }}>{t("reports.return")}</div>
              <div className="font-mono text-sm font-semibold">{formatOptionalMetric("total_return", run.total_return)}</div>
            </div>
            <div className="rounded-md px-3 py-1.5 text-right v2-card-depth-1">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--text-tertiary))' }}>{t("reports.sharpe")}</div>
              <div className="font-mono text-sm font-semibold">{formatOptionalMetric("sharpe", run.sharpe)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/runs/${run.run_id}`} className="v2-btn-primary text-xs px-3 py-1.5">
              {t("reports.fullReport")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/compare" className="v2-btn-secondary text-xs px-3 py-1.5">
              <GitCompare className="h-3.5 w-3.5" />
              {t("reports.compare")}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const ok = ["success", "done", "completed", "complete"].includes(normalized);
  return ok ? (
    <span className="v2-badge-success">
      <CheckCircle2 className="h-3 w-3" />
      {status || "unknown"}
    </span>
  ) : (
    <span className="v2-badge-neutral">
      <XCircle className="h-3 w-3" />
      {status || "unknown"}
    </span>
  );
}

function isBacktestReportRun(run: RunListItem): boolean {
  return Number.isFinite(run.total_return) || Number.isFinite(run.sharpe);
}

function compareRuns(left: RunListItem, right: RunListItem, mode: SortMode): number {
  if (mode === "created_asc") return dateMs(left.created_at) - dateMs(right.created_at);
  if (mode === "return_desc") return metric(right.total_return) - metric(left.total_return);
  if (mode === "sharpe_desc") return metric(right.sharpe) - metric(left.sharpe);
  return dateMs(right.created_at) - dateMs(left.created_at);
}

function metric(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : Number.NEGATIVE_INFINITY;
}

function formatOptionalMetric(key: string, value: number | undefined): string {
  return Number.isFinite(value) ? formatMetricVal(key, value as number) : "-";
}

function dateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRunDate(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value || "unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}
