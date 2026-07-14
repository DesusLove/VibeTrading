import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GitCompare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CorrelationMatrix } from "@/components/charts/CorrelationMatrix";

const WINDOWS = [30, 60, 90, 180, 365] as const;

export function Correlation() {
  const { t } = useTranslation();
  const [codes, setCodes] = useState("000001.SZ,600519.SH,000858.SZ,601318.SH");
  const [days, setDays] = useState<number>(90);
  const [method, setMethod] = useState<"pearson" | "spearman">("pearson");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [labels, setLabels] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<number[][]>([]);

  const compute = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await request<{ labels: string[]; matrix: number[][] }>(
        `/correlation?codes=${encodeURIComponent(codes)}&days=${days}&method=${method}`
      );
      setLabels(result.labels);
      setMatrix(result.matrix);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("correlation.failedToCompute"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-8 animate-fade-in">
      {/* Header */}
      <div className="page-header animate-slide-up">
        <div className="space-y-3">
          <div className="v2-badge-accent">
            <GitCompare className="h-3.5 w-3.5" />
            {t("correlation.title")}
          </div>
          <h1 className="page-header-title">{t("correlation.title")}</h1>
          <p className="page-header-desc">{t("correlation.assetCodesHint")}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="premium-card p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.05s" }}>
        <span className="stat-premium-label">{t("correlation.assetCodes")}</span>
        <input
          type="text"
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          placeholder="000001.SZ,600519.SH,000858.SZ,601318.SH"
          className="filter-input w-full"
        />

        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="stat-premium-label">{t("correlation.windowDays")}</span>
            <div className="flex gap-1.5">
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setDays(w)}
                  className={cn(
                    "v2-btn-secondary text-xs px-3 py-1.5",
                    days === w && "v2-btn-primary text-xs px-3 py-1.5"
                  )}
                >
                  {w}d
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="stat-premium-label">{t("correlation.method")}</span>
            <div className="flex gap-1.5">
              {(["pearson", "spearman"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "v2-btn-secondary text-xs px-3 py-1.5 capitalize",
                    method === m && "v2-btn-primary text-xs px-3 py-1.5"
                  )}
                >
                  {t(`correlation.method_${m}`)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={compute}
            disabled={loading}
            className="v2-btn-primary"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? t("correlation.loading") : t("correlation.compute")}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-state animate-fade-in">
          <div className="error-state-header">
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Chart */}
      {labels.length > 0 && (
        <div className="v2-card-depth-1 p-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <CorrelationMatrix labels={labels} matrix={matrix} height={520} />
        </div>
      )}
    </div>
  );
}

// Minimal request helper (avoids importing the full api client which may have path issues)
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const BASE = "";
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}