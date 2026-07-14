import { Link } from "react-router-dom";
import { ArrowRight, Bot, BarChart3, Zap, UserCircle2, MessageSquarePlus, SearchCode, LineChart, ShieldCheck, Activity, Clock, Layers, FileText, Gauge, DollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Home() {
  const { t } = useTranslation();

  const FEATURES = [
    { icon: Bot, title: t("home.featureAgent"), desc: t("home.featureAgentDesc") },
    { icon: BarChart3, title: t("home.featureBacktest"), desc: t("home.featureBacktestDesc") },
    { icon: Zap, title: t("home.featureStreaming"), desc: t("home.featureStreamingDesc") },
    { icon: UserCircle2, title: t("home.featureReplay"), desc: t("home.featureReplayDesc") },
  ];

  const STEPS = [
    { icon: MessageSquarePlus, title: t("home.step1Title"), desc: t("home.step1Desc") },
    { icon: SearchCode, title: t("home.step2Title"), desc: t("home.step2Desc") },
    { icon: LineChart, title: t("home.step3Title"), desc: t("home.step3Desc") },
    { icon: ShieldCheck, title: t("home.step4Title"), desc: t("home.step4Desc") },
  ];

  const METRICS = [
    { icon: Activity, label: "Total Runs", value: "1,284", change: { value: "+12.5%", dir: "up" as const } },
    { icon: Bot, label: "Active Agents", value: "8", change: { value: "+2", dir: "up" as const } },
    { icon: Gauge, label: "Win Rate", value: "68.4%", change: { value: "+3.2%", dir: "up" as const } },
    { icon: DollarSign, label: "Avg. Return", value: "+14.7%", change: { value: "+2.1%", dir: "up" as const } },
  ];

  const QUICK_ACTIONS = [
    { to: "/agent", icon: Bot, label: "Agent", desc: "Start a research conversation" },
    { to: "/reports", icon: FileText, label: "Reports", desc: "View backtest results" },
    { to: "/alpha-zoo", icon: Layers, label: "Alpha Zoo", desc: "Browse strategy zoo" },
    { to: "/correlation", icon: BarChart3, label: "Correlation", desc: "Cross-asset analysis" },
  ];

  const RECENT_ACTIVITY = [
    { time: "14:32:18", event: "Backtest completed", detail: "mean-reversion v3  Sharpe 1.42", dir: "up" as const },
    { time: "14:28:05", event: "Agent finished", detail: "AAPL earnings analysis", dir: "neutral" as const },
    { time: "14:22:41", event: "Streaming started", detail: "BTC/USD live feed", dir: "up" as const },
    { time: "14:15:09", event: "Alpha Zoo updated", detail: "12 new strategies", dir: "neutral" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 lg:px-8 lg:py-10 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="page-header animate-slide-up">
        <div className="space-y-3">
          <div className="v2-badge-accent">Dashboard</div>
          <h1 className="page-header-title">
            <span className="text-gradient-guru">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
          </h1>
          <p className="page-header-desc">Platform overview and key metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="status-indicator">
            <span className="status-indicator-dot-live" />
            <span className="status-indicator-label text-positive">System Online</span>
          </div>
          <div className="v2-badge-neutral">v0.1.11</div>
        </div>
      </div>

      {/* ─── Key Metrics ─── */}
      <div className="tile-grid-4">
        {METRICS.map(({ icon: Icon, label, value, change }, idx) => (
          <div key={label} className="metric-premium animate-slide-up" style={{ animationDelay: `${0.05 + idx * 0.06}s` }}>
            <div className="flex items-center justify-between">
              <span className="metric-label">{label}</span>
              <Icon className="h-4 w-4" style={{ color: 'hsl(var(--text-tertiary) / 0.5)' }} />
            </div>
            <div className="metric-value">{value}</div>
            <div className={`metric-change text-sm font-semibold ${change.dir === "up" ? "text-positive" : "text-negative"}`}>
              {change.value}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Quick Actions + Recent Activity ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 animate-fade-in" style={{ animationDelay: "0.15s" }}>
        <div className="v2-card-depth-2 p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <span className="stat-label">Quick Actions</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map(({ to, icon: Icon, label, desc }, idx) => (
              <Link
                key={to}
                to={to}
                className="group flex items-start gap-3 rounded-lg p-3 transition-all v2-card-depth-1"
                style={{ animationDelay: `${0.2 + idx * 0.04}s` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-guru-subtle text-guru">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>{desc}</div>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 self-center transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-guru" style={{ color: 'hsl(var(--text-tertiary))' }} />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="v2-card-depth-1 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="stat-label">Activity Log</span>
            <Clock className="h-3.5 w-3.5" style={{ color: 'hsl(var(--text-tertiary) / 0.5)' }} />
          </div>
          <div className="v2-divider-subtle !my-3" />
          <div className="divide-y divide-border-hairline">
            {RECENT_ACTIVITY.map(({ time, event, detail, dir }, i) => (
              <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dir === "up" ? "bg-positive glow-positive" : ""}`}
                  style={{ background: dir !== "up" ? 'hsl(var(--text-tertiary) / 0.25)' : undefined }} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-medium tracking-tight" style={{ color: 'hsl(var(--text-tertiary))' }}>{time}</span>
                    <span className="text-xs font-medium">{event}</span>
                  </div>
                  <div className="text-[11px] truncate leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── How It Works ─── */}
      <div className="section-premium animate-fade-in" style={{ animationDelay: "0.2s" }}>
        <div className="section-premium-header">
          <span className="section-premium-line" />
          <h2 className="section-premium-title">How It Works</h2>
          <span className="section-premium-line" />
        </div>
        <div className="tile-grid-4">
          {STEPS.map(({ icon: Icon, title, desc }, index) => (
            <div key={title} className="v2-card-depth-2 p-5 space-y-3 animate-slide-up" style={{ animationDelay: `${0.25 + index * 0.05}s` }}>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-guru to-guru/70 text-white shadow-lg shadow-guru/20">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold font-mono" style={{ color: 'hsl(var(--text-tertiary) / 0.3)' }}>
                  {(index + 1).toString().padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Features ─── */}
      <div className="section-premium animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <div className="section-premium-header">
          <span className="section-premium-line" />
          <h2 className="section-premium-title">Capabilities</h2>
          <span className="section-premium-line" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }, index) => (
            <div key={title} className="v2-card-depth-1 p-5 space-y-3 animate-slide-up" style={{ animationDelay: `${0.3 + index * 0.05}s` }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-guru-subtle text-guru">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Bottom CTA ─── */}
      <div className="v2-card-depth-3 flex items-center justify-between p-6 animate-slide-up" style={{ animationDelay: "0.35s" }}>
        <div className="space-y-1">
          <div className="text-base font-semibold">{t("home.title")}</div>
          <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>{t("home.subtitle")}</p>
        </div>
        <Link to="/agent" className="v2-btn-primary shrink-0">
          {t("home.startResearch")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
