import { Link } from "react-router-dom";
import { ArrowRight, Bot, BarChart3, Zap, UserCircle2, MessageSquarePlus, SearchCode, LineChart, ShieldCheck, Activity, Clock, Layers, FileText, Play, Gauge, DollarSign } from "lucide-react";
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
    {
      icon: Activity, label: "Total Runs", value: "1,284",
      change: { value: "+12.5%", dir: "up" as const },
    },
    {
      icon: Bot, label: "Active Agents", value: "8",
      change: { value: "+2", dir: "up" as const },
    },
    {
      icon: Gauge, label: "Win Rate", value: "68.4%",
      change: { value: "+3.2%", dir: "up" as const },
    },
    {
      icon: DollarSign, label: "Avg. Return", value: "+14.7%",
      change: { value: "+2.1%", dir: "up" as const },
    },
  ];

  const QUICK_ACTIONS = [
    { to: "/agent", icon: Bot, label: "Agent", desc: "Start a research conversation", color: "bg-amber" as const },
    { to: "/reports", icon: FileText, label: "Reports", desc: "View backtest results", color: "bg-profit" as const },
    { to: "/alpha-zoo", icon: Layers, label: "Alpha Zoo", desc: "Browse strategy zoo", color: "bg-amber" as const },
    { to: "/correlation", icon: BarChart3, label: "Correlation", desc: "Cross-asset analysis", color: "bg-amber" as const },
  ];

  const RECENT_ACTIVITY = [
    { time: "14:32:18", event: "Backtest completed", detail: "mean-reversion v3 — Sharpe 1.42", dir: "up" as const },
    { time: "14:28:05", event: "Agent finished", detail: "AAPL earnings analysis", dir: "neutral" as const },
    { time: "14:22:41", event: "Streaming started", detail: "BTC/USD live feed", dir: "up" as const },
    { time: "14:15:09", event: "Alpha Zoo updated", detail: "12 new strategies", dir: "neutral" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground/70">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="badge-success">
            <span className="status-dot-live" />
            System Online
          </div>
          <div className="badge-neutral">
            v0.1.11
          </div>
        </div>
      </div>

      {/* ─── Key Metrics ─── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {METRICS.map(({ icon: Icon, label, value, change }) => (
          <div key={label} className="metric-card">
            <div className="flex items-center justify-between">
              <span className="metric-label">{label}</span>
              <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
            </div>
            <div className="metric-value">{value}</div>
            <div className={`metric-change ${change.dir === "up" ? "text-profit" : "text-loss"}`}>
              {change.value}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Quick Actions + Recent Activity ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Quick actions — takes 2 cols */}
        <div className="glass-card p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <span className="metric-label">Quick Actions</span>
            <Play className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map(({ to, icon: Icon, label, desc, color }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-start gap-3 rounded-lg border border-transparent p-3 transition-all hover:border-border hover:bg-muted/30"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color} text-primary-foreground`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground/70">{desc}</div>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 self-center text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity — takes 1 col */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="metric-label">Activity Log</span>
            <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
          <div className="space-y-0">
            {RECENT_ACTIVITY.map(({ time, event, detail, dir }, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-border/50 py-2.5 last:border-0"
              >
                <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  dir === "up" ? "bg-profit" : "bg-muted-foreground/30"
                }`} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="num-xs text-muted-foreground/50">{time}</span>
                    <span className="text-xs font-medium">{event}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 truncate">{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── How It Works ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border/60" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
            How It Works
          </h2>
          <span className="h-px flex-1 bg-border/60" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {STEPS.map(({ icon: Icon, title, desc }, index) => (
            <div key={title} className="glass-card p-4 lg:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber text-primary-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="num-xs text-muted-foreground/25 font-bold">
                  {(index + 1).toString().padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground/70">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Features ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border/60" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
            Capabilities
          </h2>
          <span className="h-px flex-1 bg-border/60" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="glass-card-hover p-5 space-y-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber/10 text-amber">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground/70">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Bottom CTA ─── */}
      <div className="glass-card flex items-center justify-between p-5">
        <div className="space-y-1">
          <div className="text-sm font-semibold">{t("home.title")}</div>
          <p className="text-xs text-muted-foreground/70">{t("home.subtitle")}</p>
        </div>
        <Link
          to="/agent"
          className="btn-primary shrink-0"
        >
          {t("home.startResearch")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
