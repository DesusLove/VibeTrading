import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { getMarketHistory, type PriceBar } from "@/lib/api";
import { CandlestickChart } from "@/components/charts/CandlestickChart";

type Range = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "24h" | "1mo" | "1y";

const RANGES: { label: string; value: Range }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "24h", value: "24h" },
  { label: "1M", value: "1mo" },
  { label: "1Y", value: "1y" },
];

const SYMBOLS = [
  { group: "Indices", items: [
    { label: "S&P 500", value: "SPY" },
    { label: "NASDAQ", value: "QQQ" },
    { label: "Dow Jones", value: "DIA" },
    { label: "Russell 2000", value: "IWM" },
    { label: "VIX", value: "^VIX" },
  ]},
  { group: "Crypto", items: [
    { label: "Bitcoin", value: "BTC-USD" },
    { label: "Ethereum", value: "ETH-USD" },
    { label: "Solana", value: "SOL-USD" },
    { label: "XRP", value: "XRP-USD" },
    { label: "Cardano", value: "ADA-USD" },
    { label: "Dogecoin", value: "DOGE-USD" },
  ]},
  { group: "Stocks", items: [
    { label: "Apple", value: "AAPL" },
    { label: "Microsoft", value: "MSFT" },
    { label: "Google", value: "GOOGL" },
    { label: "Amazon", value: "AMZN" },
    { label: "NVIDIA", value: "NVDA" },
    { label: "Meta", value: "META" },
    { label: "Tesla", value: "TSLA" },
    { label: "Berkshire B", value: "BRK-B" },
    { label: "JPMorgan", value: "JPM" },
    { label: "Vanguard S&P", value: "VOO" },
  ]},
  { group: "Forex", items: [
    { label: "EUR/USD", value: "EURUSD=X" },
    { label: "GBP/USD", value: "GBPUSD=X" },
    { label: "USD/JPY", value: "USDJPY=X" },
  ]},
  { group: "Commodities", items: [
    { label: "Gold", value: "GC=F" },
    { label: "Crude Oil", value: "CL=F" },
    { label: "Silver", value: "SI=F" },
    { label: "Copper", value: "HG=F" },
  ]},
];

export function Charts() {
  const [symbol, setSymbol] = useState("SPY");
  const [custom, setCustom] = useState("");
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
    } catch {
      setError("Chart data unavailable — is the backend running?");
      setData([]);
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

  const handleCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = custom.trim().toUpperCase();
    if (trimmed) setSymbol(trimmed);
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-6 pt-5 pb-2 flex-wrap">
        {/* Symbol selector dropdown */}
        <div className="relative">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-44 px-2.5 py-1.5 rounded text-xs font-mono bg-surface-muted border border-border-hairline text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors appearance-none cursor-pointer"
          >
            {SYMBOLS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map((item) => (
                  <option key={item.value} value={item.value}>{item.label} ({item.value})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Custom symbol input */}
        <form onSubmit={handleCustom} className="flex items-center gap-1">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Any symbol…"
            className="w-24 px-2 py-1.5 rounded text-xs font-mono bg-surface-muted border border-border-hairline text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-accent-primary/50 transition-colors"
          />
          <button
            type="submit"
            className="px-2 py-1.5 rounded text-[10px] font-mono bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            Go
          </button>
        </form>

        <div className="w-px h-4 bg-border-hairline" />

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

      <div ref={containerRef} className="flex-1 min-h-0 px-6 pb-6">
        <div className="h-full w-full rounded-lg overflow-hidden bg-surface-muted/20 border border-border-hairline">
          {error ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2 text-text-tertiary max-w-sm text-center">
                <AlertCircle className="h-5 w-5" />
                <span className="text-xs">{error}</span>
              </div>
            </div>
          ) : data.length > 0 ? (
            <CandlestickChart data={data} height={chartHeight} />
          ) : !loading ? (
            <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
              Select a symbol to view chart
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
