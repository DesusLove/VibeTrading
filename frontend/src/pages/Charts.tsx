import { useEffect, useRef, useState } from "react";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { getMarketHistory, type PriceBar } from "@/lib/api";
import { CandlestickChart } from "@/components/charts/CandlestickChart";

type Range = "1mo" | "3mo" | "6mo" | "1y" | "5y";

const RANGES: { label: string; value: Range }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "5Y", value: "5y" },
];

export function Charts() {
  const [symbol, setSymbol] = useState("SPY");
  const [input, setInput] = useState("SPY");
  const [period, setPeriod] = useState<Range>("1y");
  const [data, setData] = useState<PriceBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(600);

  const fetchData = async (sym: string, per: Range) => {
    setLoading(true);
    setError("");
    try {
      const bars = await getMarketHistory(sym, per);
      setData(bars);
      if (bars.length === 0) setError(`No data for "${sym}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chart data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(symbol, period);
  }, [symbol, period]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim().toUpperCase();
    if (trimmed && trimmed !== symbol) {
      setSymbol(trimmed);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Controls */}
      <div className="shrink-0 flex items-center gap-3 px-6 pt-5 pb-2">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search symbol…"
            className="w-44 pl-8 pr-3 py-1.5 rounded text-xs font-mono bg-surface-muted border border-border-hairline text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-accent-primary/50 transition-colors"
          />
        </form>

        <div className="flex gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setPeriod(r.value)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-colors ${
                period === r.value
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-muted/50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-1.5 text-text-tertiary">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-[10px] font-mono">Loading…</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 min-h-0 px-6 pb-6">
        <div className="h-full w-full rounded-lg overflow-hidden bg-surface-muted/20 border border-border-hairline">
          {error ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2 text-text-tertiary">
                <AlertCircle className="h-5 w-5" />
                <span className="text-xs">{error}</span>
              </div>
            </div>
          ) : data.length > 0 ? (
            <CandlestickChart data={data} height={chartHeight} />
          ) : !loading ? (
            <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
              Enter a symbol to view chart
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
