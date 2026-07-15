import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import i18n from "@/i18n";
import { ChevronDown, Minus, MousePointer2, TrendingUp, Divide, Layers, ArrowRight, Square, Trash2 } from "lucide-react";
import type { PriceBar, TradeMarker, IndicatorPoint } from "@/lib/api";
import { calcMA, calcBOLL, calcEMA } from "@/lib/indicators";
import { createChart, CandlestickSeries, LineSeries, ColorType, CrosshairMode, createSeriesMarkers } from "lightweight-charts";
import type { IChartApi, ISeriesApi, CandlestickData, LineData, Time, IPriceLine } from "lightweight-charts";

type Overlay = "ma5" | "ma10" | "ma20" | "ma60" | "ema12" | "ema26" | "boll";

type ToolType = "cursor" | "horizontal" | "vertical" | "trend" | "fib" | "ray" | "rect";

interface Drawing {
  id: string;
  type: ToolType;
  start: { time: Time; price: number };
  end?: { time: Time; price: number };
  color: string;
}

const OVERLAY_OPTIONS: { id: Overlay; label: string; group: string }[] = [
  { id: "ma5", label: "MA5", group: "MA" },
  { id: "ma10", label: "MA10", group: "MA" },
  { id: "ma20", label: "MA20", group: "MA" },
  { id: "ma60", label: "MA60", group: "MA" },
  { id: "ema12", label: "EMA12", group: "MA" },
  { id: "ema26", label: "EMA26", group: "MA" },
  { id: "boll", label: "BOLL", group: "Channel" },
];

const OVERLAY_COLORS = ["#f59e0b", "#8b5cf6", "#3b82f6", "#ec4899", "#10b981", "#f97316", "#6366f1"];

const DRAWING_COLORS = ["#22d3ee", "#fb923c", "#a78bfa", "#f472b6", "#34d399", "#facc15", "#818cf8"];
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

interface Props {
  data: PriceBar[];
  markers?: TradeMarker[];
  indicators?: Record<string, IndicatorPoint[]>;
  height?: number;
}

const TH = {
  up: "#22c55e", down: "#ef4444",
  volUp: "rgba(34,197,94,0.3)", volDown: "rgba(239,68,68,0.3)",
};

function toTime(d: string | number | Time): Time {
  return d as Time;
}

function toNum(t: Time): number {
  if (typeof t === "number") return t;
  if (typeof t === "string") return new Date(t).getTime() / 1000;
  return new Date(`${t.year}-${t.month}-${t.day}`).getTime() / 1000;
}

const TOOLS: { id: ToolType; icon: React.ReactNode; label: string }[] = [
  { id: "cursor", icon: <MousePointer2 className="h-3.5 w-3.5" />, label: "Cursor — navigate / select" },
  { id: "horizontal", icon: <Minus className="h-3.5 w-3.5" />, label: "Horizontal Line — click to place" },
  { id: "vertical", icon: <Divide className="h-3.5 w-3.5 rotate-90" />, label: "Vertical Line — click to place" },
  { id: "trend", icon: <TrendingUp className="h-3.5 w-3.5" />, label: "Trend Line — click start, then end" },
  { id: "ray", icon: <ArrowRight className="h-3.5 w-3.5" />, label: "Ray — click origin, then direction" },
  { id: "rect", icon: <Square className="h-3.5 w-3.5" />, label: "Rectangle — click first corner, then opposite" },
  { id: "fib", icon: <Layers className="h-3.5 w-3.5" />, label: "Fibonacci — click low, then high (or vice versa)" },
];

export function CandlestickChart({ data, markers, indicators: _indicators, height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const drawingLinesRef = useRef<ISeriesApi<"Line">[]>([]);
  const drawingPricesRef = useRef<IPriceLine[]>([]);
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(["ma5", "ma20"]));
  const [showMenu, setShowMenu] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const placingRef = useRef<{ tool: ToolType; first: { time: Time; price: number } } | null>(null);
  const drawColorIdx = useRef(0);
  const [feedback, setFeedback] = useState("");

  const toggleOverlay = useCallback((id: Overlay) => {
    setOverlays(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const cappedData = useMemo(() => {
    if (data.length <= 400) return data;
    const step = Math.ceil(data.length / 400);
    const result: PriceBar[] = [];
    for (let i = 0; i < data.length; i += step) result.push(data[i]);
    result[result.length - 1] = data[data.length - 1];
    return result;
  }, [data]);

  const baseData = useMemo(() => {
    const dates = cappedData.map(d => d.time);
    const closes = cappedData.map(d => d.close);
    const highs = cappedData.map(d => d.high);
    const lows = cappedData.map(d => d.low);
    const opens = cappedData.map(d => d.open);
    return { dates, closes, highs, lows, opens };
  }, [cappedData]);

  const indicatorCache = useMemo(() => {
    const c = baseData.closes;
    const needs = overlays.size > 0;
    return {
      ma5: needs && overlays.has("ma5") ? calcMA(c, 5) : [],
      ma10: needs && overlays.has("ma10") ? calcMA(c, 10) : [],
      ma20: needs && overlays.has("ma20") ? calcMA(c, 20) : [],
      ma60: needs && overlays.has("ma60") ? calcMA(c, 60) : [],
      ema12: needs && overlays.has("ema12") ? calcEMA(c, 12) : [],
      ema26: needs && overlays.has("ema26") ? calcEMA(c, 26) : [],
      boll: needs && overlays.has("boll") ? calcBOLL(c, 20, 2) : { upper: [], mid: [], lower: [] },
    };
  }, [baseData, overlays]);

  const selectTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    placingRef.current = null;
    setSelectedId(null);
    if (tool === "cursor") {
      setFeedback("");
    } else {
      const toolName = TOOLS.find(t => t.id === tool)?.label || tool;
      setFeedback(`Active: ${toolName}`);
    }
  }, []);

  const clearAll = useCallback(() => {
    setDrawings([]);
    placingRef.current = null;
    setSelectedId(null);
    setFeedback("All drawings cleared");
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setDrawings(prev => prev.filter(d => d.id !== selectedId));
    setSelectedId(null);
    setFeedback("Drawing deleted");
  }, [selectedId]);

  // Init chart
  useEffect(() => {
    if (!containerRef.current || cappedData.length === 0) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.04)" },
      timeScale: { borderColor: "rgba(255,255,255,0.04)", timeVisible: true, secondsVisible: false, borderVisible: true },
    });

    chartRef.current = chart;

    const mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: TH.up,
      downColor: TH.down,
      borderUpColor: TH.up,
      borderDownColor: TH.down,
      wickUpColor: TH.up,
      wickDownColor: TH.down,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    mainSeriesRef.current = mainSeries;

    const candleData: CandlestickData[] = cappedData.map(d => ({
      time: toTime(d.time),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    mainSeries.setData(candleData);

    if (markers && markers.length > 0) {
      createSeriesMarkers(mainSeries,
        markers.map(m => ({
          time: toTime(m.time),
          position: m.side === "BUY" ? "belowBar" : "aboveBar",
          color: m.side === "BUY" ? TH.up : TH.down,
          shape: m.side === "BUY" ? "arrowUp" : "arrowDown",
          text: `${m.side === "BUY" ? "B" : "S"} ${m.price}`,
        })),
      );
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.resize(containerRef.current.clientWidth, height);
    });
    ro.observe(containerRef.current!);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      overlaySeriesRef.current = [];
      drawingLinesRef.current = [];
      drawingPricesRef.current = [];
    };
  }, [cappedData]);

  // Overlays
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || cappedData.length === 0) return;

    for (const s of overlaySeriesRef.current) chart.removeSeries(s);
    overlaySeriesRef.current = [];

    const { dates } = baseData;
    let ci = 0;

    const addLine = (values: (number | null)[], color?: string) => {
      const lined: LineData[] = [];
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) lined.push({ time: toTime(dates[i]), value: values[i] as number });
      }
      if (lined.length === 0) return;
      const s = chart.addSeries(LineSeries, {
        color: color || OVERLAY_COLORS[ci++ % OVERLAY_COLORS.length],
        lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
      });
      s.setData(lined);
      overlaySeriesRef.current.push(s);
    };

    for (const [key, vals] of Object.entries({ ma5: indicatorCache.ma5, ma10: indicatorCache.ma10, ma20: indicatorCache.ma20, ma60: indicatorCache.ma60, ema12: indicatorCache.ema12, ema26: indicatorCache.ema26 })) {
      if (overlays.has(key as Overlay)) addLine(vals);
    }
    if (overlays.has("boll")) {
      const b = indicatorCache.boll;
      for (const v of [b.upper, b.mid, b.lower]) addLine(v, "#22c55e");
    }
  }, [overlays, indicatorCache, baseData, cappedData]);

  // Render drawings
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = mainSeriesRef.current;
    if (!chart || !mainSeries || cappedData.length === 0) return;

    for (const s of drawingLinesRef.current) chart.removeSeries(s);
    for (const p of drawingPricesRef.current) mainSeries.removePriceLine(p);
    drawingLinesRef.current = [];
    drawingPricesRef.current = [];

    const maxTime = Math.max(...cappedData.map(d => toNum(toTime(d.time))));
    const minTime = Math.min(...cappedData.map(d => toNum(toTime(d.time))));
    const timeRange = maxTime - minTime;
    const farRight = maxTime + timeRange * 2;

    const allPrices = cappedData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceSpan = maxPrice - minPrice || 1;

    for (const dw of drawings) {
      const isSelected = dw.id === selectedId;
      const thickness = isSelected ? 2 : 1;

      if (dw.type === "horizontal") {
        const p = mainSeries.createPriceLine({
          price: dw.start.price,
          color: dw.color,
          lineWidth: thickness,
          lineStyle: isSelected ? 0 : 2,
          axisLabelVisible: true,
          title: "",
        });
        drawingPricesRef.current.push(p);
      }

      if (dw.type === "vertical") {
        const s = chart.addSeries(LineSeries, {
          color: dw.color,
          lineWidth: thickness,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        s.setData([
          { time: dw.start.time, value: minPrice - priceSpan * 0.1 },
          { time: dw.start.time, value: maxPrice + priceSpan * 0.1 },
        ]);
        drawingLinesRef.current.push(s);
      }

      if ((dw.type === "trend" || dw.type === "ray") && dw.start && dw.end) {
        let pts: { time: Time; value: number }[];
        if (dw.type === "ray") {
          const t1 = toNum(dw.start.time);
          const t2 = toNum(dw.end.time);
          const p1 = dw.start.price;
          const p2 = dw.end.price;
          if (t2 > t1) {
            const slope = (p2 - p1) / (t2 - t1);
            const endPrice = p1 + slope * (farRight - t1);
            pts = [
              { time: dw.start.time, value: dw.start.price },
              { time: farRight as unknown as Time, value: endPrice },
            ];
          } else {
            pts = [
              { time: dw.start.time, value: dw.start.price },
              { time: dw.end.time, value: dw.end.price },
            ];
          }
        } else {
          pts = [
            { time: dw.start.time, value: dw.start.price },
            { time: dw.end.time, value: dw.end.price },
          ];
        }
        const s = chart.addSeries(LineSeries, {
          color: dw.color,
          lineWidth: thickness,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        s.setData(pts);
        drawingLinesRef.current.push(s);
      }

      if (dw.type === "rect" && dw.start && dw.end) {
        const corners: { time: Time; value: number }[] = [
          { time: dw.start.time, value: dw.start.price },
          { time: dw.start.time, value: dw.end.price },
          { time: dw.end.time, value: dw.end.price },
          { time: dw.end.time, value: dw.start.price },
          { time: dw.start.time, value: dw.start.price },
        ];
        const s = chart.addSeries(LineSeries, {
          color: dw.color,
          lineWidth: thickness,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        s.setData(corners);
        drawingLinesRef.current.push(s);
      }

      if (dw.type === "fib" && dw.start && dw.end) {
        const low = Math.min(dw.start.price, dw.end.price);
        const high = Math.max(dw.start.price, dw.end.price);
        const diff = high - low;

        const s = chart.addSeries(LineSeries, {
          color: dw.color,
          lineWidth: thickness,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        s.setData([
          { time: dw.start.time, value: dw.start.price },
          { time: dw.end.time, value: dw.end.price },
        ]);
        drawingLinesRef.current.push(s);

        for (const level of FIB_LEVELS) {
          const price = high - diff * level;
          const p = mainSeries.createPriceLine({
            price,
            color: dw.color,
            lineWidth: thickness,
            lineStyle: isSelected ? 0 : 3,
            axisLabelVisible: true,
            title: `${(level * 100).toFixed(1)}%`,
          });
          drawingPricesRef.current.push(p);
        }
      }
    }
  }, [drawings, selectedId, cappedData]);

  // Chart click handler — drawing + selection
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;

    // Use capture phase to ensure we catch clicks before Lightweight Charts' internal handlers
    const onChartClick = (e: MouseEvent) => {
      // Only handle clicks within the chart container
      if (!container.contains(e.target as Node)) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (activeTool === "cursor") {
        // Hit-test drawings
        const mainSeries = mainSeriesRef.current;
        if (!mainSeries) return;
        let closest: string | null = null;
        let closestDist = 20;
        for (const dw of drawings) {
          const pts: { time: Time; price: number }[] = [{ time: dw.start.time, price: dw.start.price }];
          if (dw.end) pts.push({ time: dw.end.time, price: dw.end.price });
          if (dw.type === "rect" && dw.end) {
            pts.push({ time: dw.start.time, price: dw.end.price });
            pts.push({ time: dw.end.time, price: dw.start.price });
          }
          for (const p of pts) {
            const px = chart.timeScale().timeToCoordinate(p.time);
            const py = mainSeries.priceToCoordinate(p.price);
            if (px === null || py === null) continue;
            const dx = (px as number) - x;
            const dy = (py as number) - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist) {
              closestDist = dist;
              closest = dw.id;
            }
          }
        }
        setSelectedId(closest);
        setFeedback(closest ? "Drawing selected — Delete to remove" : "");
        return;
      }

      const time = chart.timeScale().coordinateToTime(x);
      if (!time) return;
      if (!mainSeriesRef.current) return;
      const price = mainSeriesRef.current.coordinateToPrice(y);
      if (price === null) return;

      const t = toTime(time);
      const singleClick = activeTool === "horizontal" || activeTool === "vertical";
      const doubleClick = activeTool === "trend" || activeTool === "fib" || activeTool === "ray" || activeTool === "rect";

      if (singleClick) {
        const color = DRAWING_COLORS[drawColorIdx.current++ % DRAWING_COLORS.length];
        setDrawings(prev => [...prev, { id: crypto.randomUUID(), type: activeTool, start: { time: t, price }, color }]);
        setFeedback(`${activeTool} placed`);
      } else if (doubleClick) {
        const placing = placingRef.current;
        if (!placing) {
          placingRef.current = { tool: activeTool, first: { time: t, price } };
          setFeedback(`First point set. Click for second point.`);
        } else {
          const color = DRAWING_COLORS[drawColorIdx.current++ % DRAWING_COLORS.length];
          setDrawings(prev => [...prev, { id: crypto.randomUUID(), type: placing.tool, start: placing.first, end: { time: t, price }, color }]);
          placingRef.current = null;
          setFeedback(`${placing.tool} placed`);
        }
      }
    };

    container.addEventListener("click", onChartClick, true);
    return () => container.removeEventListener("click", onChartClick, true);
  }, [activeTool, cappedData]);

  // Keyboard: Escape to cancel tool/placement, Delete to remove selected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (placingRef.current) {
          placingRef.current = null;
          setFeedback("Placement cancelled");
        } else if (activeTool !== "cursor") {
          setActiveTool("cursor");
          setFeedback("");
        }
        setSelectedId(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, selectedId, deleteSelected]);

  // Auto-clear feedback after 3s
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  if (cappedData.length === 0) {
    return <div className="text-muted-foreground text-sm p-4">{i18n.t("charts.noPriceData")}</div>;
  }

  const toolName = TOOLS.find(t => t.id === activeTool)?.label || "";

  return (
    <div>
      <div className="flex items-center gap-0.5 mb-1 flex-wrap">
        <div className="w-px h-3 bg-border/40 mr-1" />

        <div className="flex items-center gap-px bg-muted/30 rounded p-px">
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => selectTool(t.id)}
              title={t.label}
              className={`flex items-center justify-center w-6 h-5 rounded text-[10px] transition-colors ${
                activeTool === t.id
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {t.icon}
            </button>
          ))}
        </div>

        <div className="w-px h-3 bg-border/40 mx-1" />

        {selectedId && (
          <button
            onClick={deleteSelected}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete selected drawing"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        )}

        {!selectedId && drawings.length > 0 && (
          <button
            onClick={clearAll}
            className="px-1.5 py-0.5 rounded text-[9px] text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Clear all
          </button>
        )}

        <div className="w-px h-3 bg-border/40" />

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Indicators ({overlays.size}) <ChevronDown className="h-3 w-3" />
          </button>
          {showMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-card border rounded-lg shadow-lg p-2 min-w-[160px]" onMouseLeave={() => setShowMenu(false)}>
              {["MA", "Channel"].map(group => (
                <div key={group}>
                  <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider px-1 pt-1">{group}</p>
                  {OVERLAY_OPTIONS.filter(o => o.group === group).map(o => (
                    <label key={o.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/30 cursor-pointer">
                      <input type="checkbox" checked={overlays.has(o.id)} onChange={() => toggleOverlay(o.id)} className="h-3 w-3 rounded accent-primary" />
                      <span className="text-xs">{o.label}</span>
                    </label>
                  ))}
                </div>
              ))}
              <div className="border-t mt-1 pt-1">
                <button onClick={() => { setOverlays(new Set()); setShowMenu(false); }} className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 w-full text-left rounded hover:bg-muted/30">
                  Bare K (clear all)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div className="text-[10px] text-primary mb-1 ml-0.5 font-medium">
          {feedback}
        </div>
      )}

      {activeTool !== "cursor" && (
        <div className="flex items-center gap-2 mb-1 ml-0.5">
          <span className="text-[9px] text-amber-400/70 font-mono bg-amber-400/5 px-1.5 py-0.5 rounded">
            {toolName}
          </span>
          <span className="text-[9px] text-muted-foreground/40">Esc to cancel</span>
        </div>
      )}

      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
