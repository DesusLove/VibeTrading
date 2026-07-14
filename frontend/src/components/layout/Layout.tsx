import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Activity, BarChart3, Bot, Check, ChevronDown, FileText, GitCompare, Languages, Moon, Sun, Plus, Trash2, Pencil, ChevronsLeft, ChevronsRight, Settings, Layers, Loader2, Menu, X, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useBinanceTicker } from "@/hooks/useBinanceTicker";
import { api, getTicker, type SessionItem, type TickerItem } from "@/lib/api";
import { useAgentStore } from "@/stores/agent";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export function Layout() {
  const { t } = useTranslation();

  const NAV = [
    { to: "/", icon: BarChart3, label: t('layout.home') },
    { to: "/agent", icon: Bot, label: t('layout.agent') },
    { to: "/runtime", icon: Activity, label: t('layout.runtime') },
    { to: "/reports", icon: FileText, label: t('layout.reports') },
    { to: "/alpha-zoo", icon: Layers, label: t('layout.alphaZoo') },
    { to: "/settings", icon: Settings, label: t('layout.settings') },
    { to: "/correlation", icon: GitCompare, label: t('layout.correlation') },
  ];

  const [ticker, setTicker] = useState<TickerItem[]>(STATIC_FALLBACK);
  const [tickerLoading, setTickerLoading] = useState(true);
  const binanceTicker = useBinanceTicker();
  const binanceRef = useRef(binanceTicker);
  binanceRef.current = binanceTicker;

  // Merge real-time Binance WS data into the ticker array whenever it updates
  useEffect(() => {
    if (binanceTicker.size === 0) return;
    setTicker((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((item) => {
        const live = binanceTicker.get(item.symbol);
        return live && isValidTicker(live)
          ? { symbol: live.symbol, price: live.price, change: live.change, pct: live.pct, dir: live.dir }
          : item;
      });
    });
  }, [binanceTicker]);

  const isValidTicker = (item: TickerItem) =>
    item.price && item.price !== "0" && item.price !== "$0.00" && item.price !== "0.00";

  const mergeData = (current: TickerItem[], incoming: TickerItem[]) => {
    const map = new Map(incoming.filter(isValidTicker).map((d) => [d.symbol, d]));
    const bd = binanceRef.current;
    if (bd.size === 0) return current.map((item) => map.get(item.symbol) || item);
    return current.map((item) => {
      const live = bd.get(item.symbol);
      if (live && isValidTicker(live)) return live;
      return map.get(item.symbol) || item;
    });
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      // 1. Try backend with 5s timeout
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5_000);
        const data = await getTicker(ctrl.signal);
        clearTimeout(timer);
        if (mounted && data.some(isValidTicker)) {
          setTicker((prev) => mergeData(prev, data));
          setTickerLoading(false);
          return;
        }
      } catch { /* backend down or timeout */ }

      // 2. Try public APIs
      try {
        const data = await fetchPublicTicker();
        if (mounted && data.some(isValidTicker)) {
          setTicker((prev) => mergeData(prev, data));
          setTickerLoading(false);
          return;
        }
      } catch { /* public apis down */ }

      // 3. Last resort
      if (mounted) {
        setTickerLoading(false);
      }
    };

    run();
    const interval = setInterval(run, 15_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { dark, toggle } = useDarkMode();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const sseStatus = useAgentStore(s => s.sseStatus);
  const sseRetryAttempt = useAgentStore(s => s.sseRetryAttempt);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("qa-sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const activeSessionId = searchParams.get("session");
  const streamingSessionId = useAgentStore(s => s.streamingSessionId);

  useEffect(() => {
    localStorage.setItem("qa-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  const loadSessions = () => {
    api.listSessions()
      .then((list) => setSessions(Array.isArray(list) ? list : []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  };

  const isAgentPage = pathname.startsWith("/agent");
  useEffect(() => { loadSessions(); }, [isAgentPage, activeSessionId]);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const deleteSession = async (sid: string) => {
    try {
      await api.deleteSession(sid);
      setSessions((prev) => prev.filter((s) => s.session_id !== sid));
    } catch { /* ignore */ }
    setDeleteTarget(null);
  };

  const renameSession = async (sid: string) => {
    if (!renameValue.trim()) { setRenameTarget(null); return; }
    try {
      await api.renameSession(sid, renameValue.trim());
      setSessions((prev) => prev.map((s) => s.session_id === sid ? { ...s, title: renameValue.trim() } : s));
    } catch { /* ignore */ }
    setRenameTarget(null);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Gradient accent bar */}
      <div className="gradient-bar shrink-0" />

      <div className="flex flex-1 overflow-hidden rtl:flex-row-reverse">
        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "flex flex-col shrink-0 border-r transition-all duration-300",
          "bg-bg-elevated border-r border-border-hairline shadow-[4px_0_12px_-8px_rgba(0,0,0,0.3)]",
          collapsed ? "w-14" : "w-52",
          "md:static md:flex",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50"
            : "hidden"
        )}>
          {/* Sidebar edge glow */}
          <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-guru/10 to-transparent pointer-events-none" />
          {/* Brand */}
          <div className={cn("border-b border-border-hairline flex items-center", collapsed ? "justify-center p-3" : "px-3 py-2.5")}>
            <Link to="/" className={cn("flex items-center font-semibold text-sm tracking-tight", collapsed ? "justify-center" : "gap-2.5 flex-1")}>
              <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-guru text-white">
                <BarChart3 className="h-3.5 w-3.5" />
              </div>
              {!collapsed && (
                <>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-text-primary">Vibe</span>
                    <span className="text-[9px] uppercase tracking-[0.2em] font-mono text-guru">Trading</span>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMobileOpen(false); }}
                    className="ml-auto p-0.5 text-text-tertiary hover:text-text-primary md:hidden"
                    aria-label="Close navigation"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </Link>
          </div>

          {/* Nav */}
          <nav className={cn("flex-1 overflow-auto py-2", collapsed ? "px-1.5 space-y-1" : "px-2 space-y-0.5")}>
            {NAV.map(({ to, icon: Icon, label }, idx) => {
              const text = label;
              const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "nav-item group rounded-sm transition-all",
                      collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-1.5",
                      isActive
                        ? "nav-item-active bg-guru-subtle text-guru"
                        : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                    )}
                    title={collapsed ? text : undefined}
                    style={{ animationDelay: !collapsed ? `${0.05 + idx * 0.03}s` : undefined }}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !collapsed && "group-hover:scale-110")} aria-hidden="true" />
                    {!collapsed && <span className="text-xs font-medium">{text}</span>}
                    {!collapsed && isActive && (
                      <span className="ml-auto inline-block w-1 h-1 rounded-full bg-guru animate-glow-pulse" />
                    )}
                  </Link>
              );
            })}
          </nav>

          {/* Sessions */}
          {!collapsed && (
            <div className="border-t border-border-hairline flex flex-col min-h-0">
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[9px] uppercase tracking-[0.15em] font-semibold text-text-tertiary">
                  {t('layout.sessions')}
                </span>
                <Link
                  to="/agent"
                  className="flex items-center justify-center h-4 w-4 text-text-tertiary hover:text-guru hover:bg-guru-subtle transition-all rounded-sm"
                  title={t('layout.newChat')}
                >
                  <Plus className="h-2.5 w-2.5" />
                </Link>
              </div>

              <div className="overflow-auto flex-1 px-1.5 pb-1.5 space-y-0.5">
                {sessionsLoading ? (
                  <div className="space-y-1 px-2 py-1">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-6 shimmer rounded-sm" />
                    ))}
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="px-3 py-2 text-[10px] text-text-tertiary">{t('layout.noSessions')}</p>
                ) : null}
                {sessions.map((s) => {
                  const isActive = s.session_id === activeSessionId;
                  const isDeleting = deleteTarget === s.session_id;
                  const isRenaming = renameTarget === s.session_id;
                  return (
                    <div key={s.session_id} className="group relative flex items-center">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") renameSession(s.session_id); if (e.key === "Escape") setRenameTarget(null); }}
                          onBlur={() => renameSession(s.session_id)}
                          className="flex-1 min-w-0 px-2 py-1 text-[11px] input-field"
                        />
                      ) : (
                        <Link
                          to={`/agent?session=${s.session_id}`}
                          className={cn(
                            "flex-1 min-w-0 px-2.5 py-1 text-[11px] transition-colors truncate block rounded-sm",
                            isActive
                              ? "bg-guru-subtle text-guru"
                              : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                          )}
                          title={s.title || s.session_id}
                        >
                          <span className="flex items-center gap-1.5">
                            {streamingSessionId === s.session_id ? (
                              <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-guru" />
                            ) : (
                              <span className={cn(
                                "inline-block w-1 h-1 rounded-full shrink-0",
                                isActive ? "bg-guru" : "bg-text-tertiary"
                              )} />
                            )}
                            <span className="num-2xs">{s.title || s.session_id.slice(0, 16)}</span>
                          </span>
                        </Link>
                      )}
                      {!isRenaming && isDeleting ? (
                        <div className="absolute right-0.5 flex items-center gap-0.5">
                          <button onClick={() => deleteSession(s.session_id)} className="px-1.5 py-0.5 text-[10px] font-medium text-negative hover:bg-negative/10 transition-colors rounded-sm">{t('layout.confirm')}</button>
                          <button onClick={() => setDeleteTarget(null)} className="px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-surface-muted transition-colors rounded-sm">{t('layout.cancel')}</button>
                        </div>
                      ) : !isRenaming ? (
                        <div className="absolute right-0.5 opacity-0 group-hover:opacity-100 flex items-center gap-px transition-opacity">
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenameTarget(s.session_id); setRenameValue(s.title || ""); }}
                            className="flex h-5 w-5 items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-muted transition-all rounded-sm"
                            title={t('layout.rename')}
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(s.session_id); }}
                            className="flex h-5 w-5 items-center justify-center text-text-tertiary hover:text-negative hover:bg-negative/10 transition-all rounded-sm"
                            title={t('layout.delete')}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {collapsed && <div className="flex-1" />}

          {/* Footer */}
          <div className={cn("border-t border-border-hairline", collapsed ? "p-2 flex flex-col items-center gap-2" : "p-1.5 space-y-1.5")}>
            {collapsed ? (
              <>
                <button onClick={toggle} className="p-1.5 text-text-tertiary hover:text-guru transition-colors rounded-sm hover:bg-guru-subtle" title={dark ? t('layout.light') : t('layout.dark')}>
                  {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setCollapsed(false)} className="p-1.5 text-text-tertiary hover:text-guru transition-colors rounded-sm hover:bg-guru-subtle" title={t('layout.expand')}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <button onClick={toggle} className="flex items-center gap-1.5 text-[10px] text-text-tertiary hover:text-guru transition-colors rounded-sm px-1.5 py-1 hover:bg-guru-subtle">
                    {dark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                    {dark ? t('layout.light') : t('layout.dark')}
                  </button>
                  <button onClick={() => setCollapsed(true)} className="p-1 text-text-tertiary hover:text-guru transition-colors rounded-sm hover:bg-guru-subtle" title={t('layout.collapse')}>
                    <ChevronsLeft className="h-3 w-3" />
                  </button>
                </div>
                <div className="px-1 space-y-1.5">
                  <LanguageSwitcher />
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Mobile hamburger */}
        <div className="fixed top-3 left-3 z-30 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-7 w-7 items-center justify-center border border-border-hairline glass-panel text-text-secondary hover:text-text-primary transition-all"
            aria-label="Open navigation"
          >
            <Menu className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Market ticker tape */}
          <div className="ticker-bar shrink-0 overflow-hidden">
            <div className="flex animate-ticker-scroll gap-0" style={{ minWidth: "200%" }}>
              {ticker.length > 0 ? (
                [...ticker, ...ticker].map((item, i) => (
                  <span key={`${item.symbol}-${i}`} className="ticker-item">
                    <span className="ticker-label">{item.symbol}</span>
                    <span className="ticker-value">{item.price}</span>
                    <span className={cn(
                      "font-medium tabular-nums",
                      item.dir === "up" ? "ticker-up" : item.dir === "down" ? "ticker-down" : "ticker-neutral"
                    )}>
                      {item.dir === "up" ? "+" : ""}{item.change} ({item.pct})
                    </span>
                  </span>
                ))
              ) : (
                <span className="ticker-item">
                  <span className="text-text-tertiary text-[11px] font-mono">
                    {tickerLoading ? (
                      <span className="inline-flex items-center gap-2"><span className="inline-block w-1.5 h-1.5 rounded-full bg-text-tertiary/50 shimmer" style={{ animationDuration: "1.2s" }} /> Loading market data...</span>
                    ) : (
                      "Awaiting market data..."
                    )}
                  </span>
                </span>
              )}
            </div>
          </div>

          <ConnectionBanner status={sseStatus} retryAttempt={sseRetryAttempt} />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>

          {/* Status Bar */}
          <div className="status-bar shrink-0">
            <div className="flex items-center gap-2">
              <span className="status-indicator-dot-live" />
              <span className="text-[10px] uppercase tracking-[0.15em] font-semibold font-mono text-positive" style={{ fontSize: "9px" }}>Live</span>
              <span className="text-[9px] font-mono text-text-tertiary/60 mx-1">|</span>
              <span className="text-[9px] font-mono text-text-tertiary">{ticker.length} pairs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-block w-1.5 h-1.5 rounded-full",
                sseStatus === "connected" ? "bg-positive glow-positive" : sseStatus === "reconnecting" ? "bg-warning" : "bg-text-tertiary"
              )} />
              <span className={cn(
                "text-[9px] font-mono",
                sseStatus === "connected" ? "text-positive" : sseStatus === "reconnecting" ? "text-warning" : "text-text-tertiary"
              )}>
                SSE {sseStatus === "connected" ? "Live" : sseStatus === "reconnecting" ? "Reconnecting" : "Offline"}
              </span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Wifi className="h-2.5 w-2.5 text-text-tertiary/50" />
              <span className="text-[9px] font-mono text-text-tertiary/60">{t('app.version')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATIC_FALLBACK: TickerItem[] = [
  { symbol: "SPX", price: "5,842", change: "+36.42", pct: "+0.63%", dir: "up" },
  { symbol: "NDX", price: "18,422", change: "+128.90", pct: "+0.70%", dir: "up" },
  { symbol: "DJI", price: "39,119", change: "-82.64", pct: "-0.21%", dir: "down" },
  { symbol: "VIX", price: "14.32", change: "-0.87", pct: "-5.73%", dir: "down" },
  { symbol: "BTC/USD", price: "67,433", change: "+1,245", pct: "+1.88%", dir: "up" },
  { symbol: "ETH/USD", price: "3,521", change: "-42.60", pct: "-1.19%", dir: "down" },
  { symbol: "EUR/USD", price: "1.0872", change: "+0.0034", pct: "+0.31%", dir: "up" },
  { symbol: "US10Y", price: "4.218%", change: "-0.032", pct: "-0.75%", dir: "down" },
  { symbol: "WTI", price: "78.45", change: "+1.23", pct: "+1.59%", dir: "up" },
  { symbol: "XAU/USD", price: "2,357", change: "+18.50", pct: "+0.79%", dir: "up" },
];

// ---------------------------------------------------------------------------
// Public ticker fallback  free browser-friendly APIs
// ---------------------------------------------------------------------------

async function fetchPublicTicker(): Promise<TickerItem[]> {
  const results: TickerItem[] = [];

  const hasSymbol = (sym: string) => results.some((r) => r.symbol === sym);

  // CoinGecko  BTC & ETH (free, no key)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();

    if (json?.bitcoin?.usd) {
      const b = json.bitcoin;
      const chg = typeof b.usd_24h_change === "number" ? b.usd_24h_change : 0;
      results.push({
        symbol: "BTC/USD",
        price: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(b.usd),
        change: (chg >= 0 ? "+" : "") + chg.toFixed(2),
        pct: (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%",
        dir: chg > 0 ? "up" : chg < 0 ? "down" : "neutral",
      });
    }
    if (json?.ethereum?.usd) {
      const e = json.ethereum;
      const chg = typeof e.usd_24h_change === "number" ? e.usd_24h_change : 0;
      results.push({
        symbol: "ETH/USD",
        price: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(e.usd),
        change: (chg >= 0 ? "+" : "") + chg.toFixed(2),
        pct: (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%",
        dir: chg > 0 ? "up" : chg < 0 ? "down" : "neutral",
      });
    }
  } catch { /* coingecko unavailable */ }

  // CoinCap  free, no key, CORS-friendly — fills missing crypto if CoinGecko failed
  if (!hasSymbol("BTC/USD") || !hasSymbol("ETH/USD")) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5_000);
      const res = await fetch("https://api.coincap.io/v2/assets/bitcoin,ethereum", { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const items = json?.data as Array<{ id: string; priceUsd: string; changePercent24Hr: string }> | undefined;
      if (items) {
        for (const item of items) {
          const sym = item.id === "bitcoin" ? "BTC/USD" : "ETH/USD";
          if (hasSymbol(sym)) continue;
          const price = parseFloat(item.priceUsd);
          const chg = parseFloat(item.changePercent24Hr) || 0;
          if (isNaN(price)) continue;
          results.push({
            symbol: sym,
            price: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(price),
            change: (chg >= 0 ? "+" : "") + chg.toFixed(2),
            pct: (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%",
            dir: chg > 0 ? "up" : chg < 0 ? "down" : "neutral",
          });
        }
      }
    } catch { /* coincap unavailable */ }
  }

  // ExchangeRate-API  EUR/USD (free, no key)
  if (!hasSymbol("EUR/USD")) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5_000);
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD", { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (json?.rates?.EUR) {
        results.push({
          symbol: "EUR/USD",
          price: (1 / json.rates.EUR).toFixed(4),
          change: "+0.0000", pct: "+0.00%", dir: "neutral",
        });
      }
    } catch { /* exchangerate-api unavailable */ }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Language switcher
// ---------------------------------------------------------------------------
function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ left: number; bottom: number; minWidth: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest?.("[data-lang-menu]")
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuWidth = 160;
      const gap = 4;
      const desiredLeft = r.right - menuWidth;
      const maxLeft = window.innerWidth - menuWidth - 8;
      const minLeft = 8;
      const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
      setMenuStyle({
        left,
        bottom: window.innerHeight - r.top + gap,
        minWidth: menuWidth,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES.find((l) => i18n.languages?.includes(l.code)) ??
    SUPPORTED_LANGUAGES[0];

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("layout.language")}
        className="flex items-center gap-1.5 text-[10px] text-text-tertiary hover:text-guru transition-colors w-full rounded-sm px-1.5 py-1 hover:bg-guru-subtle"
      >
        <Languages className="h-3 w-3 shrink-0" />
        <span className="whitespace-nowrap flex-1 text-start">{current.label}</span>
        <ChevronDown className={cn("h-2.5 w-2.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && menuStyle && (
        <ul
          data-lang-menu
          aria-label="Select language"
          style={{
            position: "fixed",
            left: menuStyle.left,
            bottom: menuStyle.bottom,
            minWidth: menuStyle.minWidth,
            zIndex: 60,
          }}
          className="glass-panel border border-border-subtle"
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang.code === current.code;
            return (
              <li key={lang.code}>
                <button
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage(lang.code).catch(console.error);
                    setOpen(false);
                  }}
                  aria-current={active || undefined}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-guru-subtle hover:text-guru transition-colors",
                    active && "text-guru font-medium",
                  )}
                >
                  <span className="flex-1 text-start whitespace-nowrap">{lang.label}</span>
                  {active && <Check className="h-3 w-3 shrink-0 text-guru" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


