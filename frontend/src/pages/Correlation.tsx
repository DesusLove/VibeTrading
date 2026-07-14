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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="badge-primary">
              <GitCompare className="h-3 w-3" />
              {t("correlation.title")}
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("correlation.title")}</h1>
          <p className="text-sm text-muted-foreground/70">{t("correlation.assetCodesHint")}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-card p-5 space-y-4">
        <span className="metric-label">{t("correlation.assetCodes")}</span>
        <input
          type="text"
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          placeholder="000001.SZ,600519.SH,000858.SZ,601318.SH"
          className="input-field w-full"
        />

        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="metric-label">{t("correlation.windowDays")}</span>
            <div className="flex gap-1.5">
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setDays(w)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-mono transition-all",
                    days === w
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "text-muted-foreground hover:border-primary hover:text-foreground"
                  )}
                >
                  {w}d
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="metric-label">{t("correlation.method")}</span>
            <div className="flex gap-1.5">
              {(["pearson", "spearman"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs capitalize transition-all",
                    method === m
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "text-muted-foreground hover:border-primary hover:text-foreground"
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
            className="btn-primary"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? t("correlation.loading") : t("correlation.compute")}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-loss/30 bg-loss/10 p-4">
          <p className="text-sm text-loss">{error}</p>
        </div>
      )}

      {/* Chart */}
      {labels.length > 0 && (
        <div className="glass-card p-5">
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