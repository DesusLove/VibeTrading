import { useEffect, useRef, useState } from "react";

export interface BinanceTickerData {
  symbol: string;
  price: string;
  change: string;
  pct: string;
  dir: "up" | "down" | "neutral";
}

const STREAMS = ["btcusdt@ticker", "ethusdt@ticker"];
const WS_URL = `wss://stream.binance.com:9443/stream?streams=${STREAMS.join("/")}`;

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

export function useBinanceTicker() {
  const [data, setData] = useState<Map<string, BinanceTickerData>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (!mounted) return;
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          if (!mounted) return;
          try {
            const msg = JSON.parse(event.data);
            const ticker = msg?.data;
            if (!ticker?.s || !ticker?.c) return;

            const sym = ticker.s as string;
            const price = parseFloat(ticker.c);
            const change = parseFloat(ticker.p || "0");
            const pct = parseFloat(ticker.P || "0");

            let label: string;
            if (sym === "BTCUSDT") label = "BTC/USD";
            else if (sym === "ETHUSDT") label = "ETH/USD";
            else return;

            const entry: BinanceTickerData = {
              symbol: label,
              price: formatPrice(price),
              change: (change >= 0 ? "+" : "") + change.toFixed(2),
              pct: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
              dir: change > 0 ? "up" : change < 0 ? "down" : "neutral",
            };

            setData((prev) => {
              const next = new Map(prev);
              next.set(label, entry);
              return next;
            });
          } catch { /* bad message */ }
        };

        ws.onclose = () => {
          if (!mounted) return;
          reconnectTimer.current = setTimeout(connect, 5_000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch { /* ws failed */ }
    };

    connect();

    return () => {
      mounted = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return data;
}
