import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Activity, BarChart3, Bot, Check, ChevronDown, FileText, GitCompare, Languages, Moon, Sun, Plus, Trash2, Pencil, ChevronsLeft, ChevronsRight, Settings, Layers, Loader2, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";
import { api, type SessionItem } from "@/lib/api";
import { useAgentStore } from "@/stores/agent";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";
import { SUPPORTED_LANGUAGES } from "@/i18n";

// APP_VERSION is sourced from i18n locale files (app.version key) to keep a
// single source of truth across the footer and every localised README.

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

  const TICKER: { symbol: string; price: string; change: string; pct: string; dir: "up" | "down" | "neutral" }[] = [
    { symbol: "SPX", price: "5,842.17", change: "36.42", pct: "0.63%", dir: "up" },
    { symbol: "NDX", price: "18,421.55", change: "128.90", pct: "0.70%", dir: "up" },
    { symbol: "DJI", price: "39,118.86", change: "-82.64", pct: "-0.21%", dir: "down" },
    { symbol: "VIX", price: "14.32", change: "-0.87", pct: "-5.73%", dir: "down" },
    { symbol: "BTC/USD", price: "67,432.80", change: "1,245.30", pct: "1.88%", dir: "up" },
    { symbol: "ETH/USD", price: "3,521.40", change: "-42.60", pct: "-1.19%", dir: "down" },
    { symbol: "EUR/USD", price: "1.0872", change: "0.0034", pct: "0.31%", dir: "up" },
    { symbol: "US10Y", price: "4.218%", change: "-0.032", pct: "-0.75%", dir: "down" },
    { symbol: "WTI", price: "78.45", change: "1.23", pct: "1.59%", dir: "up" },
    { symbol: "XAU/USD", price: "2,356.80", change: "18.50", pct: "0.79%", dir: "up" },
  ];
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { dark, toggle } = useDarkMode();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const sseStatus = useAgentStore(s => s.sseStatus);
  const sseRetryAttempt = useAgentStore(s => s.sseRetryAttempt);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("qa-sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile nav on route change
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

  // Load sessions on mount. Also refresh when navigating TO /agent or when
  // the active session changes (covers new session creation from Agent).
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
    <div className="flex h-screen bg-background rtl:flex-row-reverse">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col shrink-0 border-r transition-all duration-200",
        "bg-bg-elevated border-border-hairline",
        collapsed ? "w-14" : "w-64",
        "md:static md:flex",
        mobileOpen
          ? "fixed inset-y-0 left-0 z-50"
          : "hidden"
      )}>
        {/* Brand */}
        <div className={cn("border-b border-border-hairline flex items-center", collapsed ? "justify-center p-2.5" : "px-4 py-2.5")}>
          <Link to="/" className={cn("flex items-center font-semibold text-sm tracking-tight", collapsed ? "justify-center" : "gap-2.5 flex-1")}>
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent text-accent-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            {!collapsed && <span>Vibe-Trading</span>}
            {!collapsed && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMobileOpen(false); }}
                className="ml-auto p-0.5 text-text-tertiary hover:text-text-primary md:hidden"
                aria-label="Close navigation"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className={cn("flex-1 overflow-auto", collapsed ? "p-1.5 space-y-0.5" : "p-1.5 space-y-0.5")}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const text = label;
            const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center text-xs transition-colors",
                  collapsed ? "justify-center p-1.5" : "gap-2.5 px-2.5 py-1.5",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                )}
                title={collapsed ? text : undefined}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {!collapsed && text}
              </Link>
            );
          })}
        </nav>

        {/* Sessions */}
        {!collapsed && (
          <div className="border-t border-border-hairline flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                {t('layout.sessions')}
              </span>
              <Link
                to="/agent"
                className="flex items-center justify-center h-5 w-5 text-text-tertiary hover:text-text-primary hover:bg-surface-muted transition-colors"
                title={t('layout.newChat')}
              >
                <Plus className="h-3 w-3" />
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
                          "flex-1 min-w-0 px-2.5 py-1 text-[11px] transition-colors truncate block",
                          isActive
                            ? "bg-accent/10 text-accent"
                            : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                        )}
                        title={s.title || s.session_id}
                      >
                        <span className="flex items-center gap-1.5">
                          {streamingSessionId === s.session_id ? (
                            <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-accent" />
                          ) : (
                            <span className={cn(
                              "inline-block w-1 h-1 rounded-full shrink-0",
                              isActive ? "bg-accent" : "bg-text-tertiary"
                            )} />
                          )}
                          <span className="num-2xs">{s.title || s.session_id.slice(0, 16)}</span>
                        </span>
                      </Link>
                    )}
                    {!isRenaming && isDeleting ? (
                      <div className="absolute right-0.5 flex items-center gap-0.5">
                        <button onClick={() => deleteSession(s.session_id)} className="px-1.5 py-0.5 text-[10px] font-medium text-negative hover:bg-negative/10 transition-colors">{t('layout.confirm')}</button>
                        <button onClick={() => setDeleteTarget(null)} className="px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-surface-muted transition-colors">{t('layout.cancel')}</button>
                      </div>
                    ) : !isRenaming ? (
                      <div className="absolute right-0.5 opacity-0 group-hover:opacity-100 flex items-center gap-px transition-opacity">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenameTarget(s.session_id); setRenameValue(s.title || ""); }}
                          className="flex h-5 w-5 items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-muted transition-colors"
                          title={t('layout.rename')}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(s.session_id); }}
                          className="flex h-5 w-5 items-center justify-center text-text-tertiary hover:text-negative hover:bg-negative/10 transition-colors"
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
        <div className={cn("border-t border-border-hairline", collapsed ? "p-1.5 flex flex-col items-center gap-1" : "p-2 space-y-1.5")}>
          {collapsed ? (
            <>
              <button onClick={toggle} className="p-1 text-text-tertiary hover:text-text-primary transition-colors" title={dark ? t('layout.light') : t('layout.dark')}>
                {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setCollapsed(false)} className="p-1 text-text-tertiary hover:text-text-primary transition-colors" title={t('layout.expand')}>
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <button onClick={toggle} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-primary transition-colors">
                  {dark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                  {dark ? t('layout.light') : t('layout.dark')}
                </button>
                <button onClick={() => setCollapsed(true)} className="p-0.5 text-text-tertiary hover:text-text-primary transition-colors" title={t('layout.collapse')}>
                  <ChevronsLeft className="h-3 w-3" />
                </button>
              </div>
              <div className="px-1 space-y-1">
                <LanguageSwitcher />
                <p className="text-[9px] text-text-tertiary">{t('app.version')}</p>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Mobile hamburger */}
      <div className="fixed top-2 left-2 z-30 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Market ticker tape */}
        <div className="ticker-bar shrink-0">
          <div className="flex animate-ticker-scroll gap-0">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={i} className="ticker-item">
                <span className="ticker-label">{item.symbol}</span>
                <span className="ticker-value">{item.price}</span>
                <span className={item.dir === "up" ? "ticker-up" : item.dir === "down" ? "ticker-down" : "ticker-neutral"}>
                  {item.dir === "up" ? "+" : ""}{item.change} ({item.pct})
                </span>
              </span>
            ))}
          </div>
        </div>

        <ConnectionBanner status={sseStatus} retryAttempt={sseRetryAttempt} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language switcher — dropdown listing every language registered in
// src/i18n/index.ts. Persists the choice via i18next's localStorage detector
// and emits the `languageChanged` event handled in the i18n module to flip
// <html dir/lang> for RTL languages.
//
// Positioning: the menu uses `position: fixed` and is placed at
// `(triggerLeft, triggerTop - gap)`. This bypasses every ancestor's
// `overflow: hidden/auto/scroll`, stacking contexts, and CSS direction
// rules, so the dropdown is *always* fully visible regardless of where
// the trigger sits in the layout or which language is active. We measure
// the trigger with getBoundingClientRect() and update on resize/scroll.
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

  // Recompute the menu's fixed coordinates whenever it opens, or whenever
  // the viewport changes (resize / scroll / language switch). The menu is
  // anchored to the trigger's *left edge* and sits *above* the trigger.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Anchor: align the menu's right edge with the trigger's right edge,
      // then clamp to the viewport so the menu never overflows the screen.
      const menuWidth = 160; // px — approx longest label "العربية" + padding
      const gap = 4; // mb-1
      const desiredLeft = r.right - menuWidth;
      const maxLeft = window.innerWidth - menuWidth - 8;
      const minLeft = 8;
      const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
      setMenuStyle({
        left,
        // distance from viewport bottom: viewport height − trigger top + gap
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

  // i18n.language (singular) is the primary active language. We try an exact
  // match first against SUPPORTED_LANGUAGES. If that fails (e.g. a regional
  // variant like "ja-JP"), we fall back to i18n.languages (plural) which
  // includes both the detected and resolved codes. NOTE: i18n.languages
  // always contains the fallback language ("en"), so it must NOT be the
  // primary match — otherwise "en" being first in SUPPORTED_LANGUAGES
  // would always win and the switcher would never show any other language.
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
        className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
      >
        <Languages className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">{current.label}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
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
          className="border border-border-hairline bg-bg-raised"
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
                    "w-full flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-surface-muted hover:text-text-primary transition-colors",
                    active && "text-text-primary",
                  )}
                >
                  <span className="flex-1 text-start whitespace-nowrap">{lang.label}</span>
                  {active && <Check className="h-3 w-3 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
