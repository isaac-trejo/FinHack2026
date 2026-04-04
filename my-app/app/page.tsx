"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Activity,
  TrendingUp,
  AlertTriangle,
  Shield,
  Zap,
  Database,
  ChevronRight,
  Loader2,
  Play,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface HistoryRow {
  date: string;
  gssi: number;
  stress_zone: string;
  Oil: number;
  CPI: number;
  PPI: number;
  VIX: number;
  Freight_stress: number;
  Imports_stress: number;
  MFG_stress: number;
}

interface ForecastRow {
  date: string;
  predicted_gssi: number;
  zone: string;
}

interface DashboardData {
  current: { date: string; gssi: number; zone: string };
  history: HistoryRow[];
  forecast: ForecastRow[];
  weights: Record<string, number>;
  metrics: Record<string, unknown>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const ZONE_COLORS = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
} as const;

const ZONE_LABELS: Record<string, string> = {
  LOW: "Everything Normal",
  MEDIUM: "Pressure Building",
  HIGH: "Crisis Incoming",
};

const SIGNAL_COLORS: Record<string, string> = {
  Freight_stress: "#3b82f6",
  Imports_stress: "#8b5cf6",
  Oil: "#f97316",
  CPI: "#ef4444",
  PPI: "#ec4899",
  MFG_stress: "#06b6d4",
  VIX: "#eab308",
};

const SIGNAL_LABELS: Record<string, string> = {
  Freight_stress: "Freight (TSIFRGHT)",
  Imports_stress: "Imports (IMPGSC1)",
  Oil: "Oil (DCOILWTICO)",
  CPI: "CPI (CPIAUCSL)",
  PPI: "PPI (PPIACO)",
  MFG_stress: "Mfg Employment (MANEMP)",
  VIX: "VIX (VIXCLS)",
};

const ANNOTATIONS = [
  { date: "2020-03-01", label: "COVID-19", color: "#ef4444" },
  { date: "2021-10-01", label: "Port Congestion", color: "#f59e0b" },
  { date: "2022-02-01", label: "Ukraine War", color: "#ef4444" },
];

const PORTFOLIO_ACTIONS: Record<
  string,
  { action: string; rationale: string; icon: string }[]
> = {
  HIGH: [
    { action: "Reduce Tech Exposure", rationale: "Supply disruptions hit hardware-dependent sectors first", icon: "↓" },
    { action: "Increase Commodities", rationale: "Supply stress drives commodity prices higher", icon: "↑" },
    { action: "Buy TIPS (Inflation-Protected)", rationale: "Supply shocks propagate to CPI within 3-6 months", icon: "↑" },
    { action: "Overweight Defensive Sectors", rationale: "Utilities and staples outperform in stress regimes", icon: "⬆" },
    { action: "Increase Cash Position", rationale: "Preserve capital for volatility opportunities", icon: "💵" },
  ],
  MEDIUM: [
    { action: "Maintain Balanced Allocation", rationale: "Stress is elevated but not critical — stay diversified", icon: "⚖" },
    { action: "Begin Hedging Positions", rationale: "Options protection becomes cheaper before peak stress", icon: "🛡" },
    { action: "Monitor Freight & Oil Closely", rationale: "These leading indicators determine escalation path", icon: "👁" },
    { action: "Tilt Toward Value Stocks", rationale: "Value outperforms growth during supply-side uncertainty", icon: "↗" },
  ],
  LOW: [
    { action: "Increase Growth / Tech Exposure", rationale: "Stable supply chains favor innovation-driven sectors", icon: "↑" },
    { action: "Reduce Commodity Hedges", rationale: "Low stress means lower input cost pressure", icon: "↓" },
    { action: "Full Risk-On Positioning", rationale: "Historical returns highest when GSSI < 0.35", icon: "🚀" },
    { action: "Extend Duration in Bonds", rationale: "Low supply stress reduces inflation expectations", icon: "📈" },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function zoneColor(zone: string) {
  return ZONE_COLORS[zone as keyof typeof ZONE_COLORS] || "#6b7280";
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

// ── Card wrapper ────────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
  title,
  subtitle,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-card-border bg-card p-5 ${className}`}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted/70">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────

function GSSITooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-card-border bg-[#1a1f28] p-3 shadow-xl">
      <p className="mb-1.5 text-xs font-medium text-muted">
        {fmtDate(label)}
      </p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-gray-400">{p.name}:</span>
          <span className="font-mono font-semibold text-white">
            {typeof p.value === "number" ? p.value.toFixed(4) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/dashboard`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Dashboard data not available");
      }
      const json: DashboardData = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runPipeline = async () => {
    setPipelineRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Pipeline failed");
      }
      await loadDashboard();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPipelineRunning(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────

  const timelineData = useMemo(() => {
    if (!data) return [];
    const hist = data.history.map((h) => ({
      date: h.date,
      gssi: h.gssi,
      forecast: null as number | null,
      zone: h.stress_zone,
    }));

    const lastHist = hist[hist.length - 1];
    const merged = [...hist];

    merged.push({
      date: lastHist.date,
      gssi: null as any,
      forecast: lastHist.gssi,
      zone: lastHist.zone,
    });

    data.forecast.forEach((f) => {
      merged.push({
        date: f.date,
        gssi: null as any,
        forecast: f.predicted_gssi,
        zone: f.zone,
      });
    });

    return merged;
  }, [data]);

  const componentData = useMemo(() => {
    if (!data) return [];
    const weights = data.weights;
    return data.history.map((h) => {
      const entry: Record<string, any> = { date: h.date };
      for (const [key, w] of Object.entries(weights)) {
        const val = (h as any)[key];
        entry[key] = val != null ? round4(val * w) : 0;
      }
      return entry;
    });
  }, [data]);

  // ── Loading / Error states ──────────────────────────────────────────────

  if (!data && loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
        <div className="text-center">
          <Activity className="mx-auto mb-4 h-16 w-16 text-muted/40" />
          <h1 className="text-2xl font-bold text-foreground">
            GSSI Dashboard
          </h1>
          <p className="mt-2 text-sm text-muted">
            {error
              ? "Pipeline needs to be run first. Click below to fetch FRED data and compute the index."
              : "Loading..."}
          </p>
        </div>
        <button
          onClick={runPipeline}
          disabled={pipelineRunning}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {pipelineRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {pipelineRunning ? "Running Pipeline..." : "Run GSSI Pipeline"}
        </button>
      </div>
    );
  }

  const zone = data.current.zone as keyof typeof ZONE_COLORS;

  return (
    <div className="min-h-screen bg-background px-4 py-6 font-sans sm:px-6 lg:px-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-blue-500" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Global Supply Chain Stress Index
            </h1>
            <p className="text-xs text-muted">
              7-signal composite &middot; FRED API &middot; Updated{" "}
              {fmtDate(data.current.date)}
            </p>
          </div>
        </div>

        {/* Current GSSI Badge */}
        <div
          className="flex items-center gap-3 rounded-xl border px-5 py-3"
          style={{
            borderColor: zoneColor(zone) + "44",
            background: zoneColor(zone) + "0a",
          }}
        >
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Current GSSI
            </p>
            <p
              className="text-3xl font-bold font-mono"
              style={{ color: zoneColor(zone) }}
            >
              {data.current.gssi.toFixed(2)}
            </p>
          </div>
          <div
            className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase"
            style={{
              background: zoneColor(zone) + "20",
              color: zoneColor(zone),
            }}
          >
            {zone}
            <span className="block text-[10px] font-normal opacity-80">
              {ZONE_LABELS[zone]}
            </span>
          </div>
        </div>
      </header>

      {/* ── 3-Month Forecast Spotlight ────────────────────────────────── */}
      <Card
        className="mb-6"
        title="3-Month Windshield Forecast"
        subtitle="Machine-learning residual forecast based on 7 macro signals"
      >
        <div className="grid grid-cols-3 gap-4">
          {data.forecast.map((f, i) => {
            const fzone = f.zone as keyof typeof ZONE_COLORS;
            return (
              <div
                key={f.date}
                className="rounded-lg border border-card-border bg-background p-4 text-center"
              >
                <p className="text-xs text-muted">{fmtDate(f.date)}</p>
                <p
                  className="mt-1 text-2xl font-bold font-mono"
                  style={{ color: zoneColor(fzone) }}
                >
                  {f.predicted_gssi.toFixed(4)}
                </p>
                <div
                  className="mt-2 inline-block rounded-full px-3 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    background: zoneColor(fzone) + "20",
                    color: zoneColor(fzone),
                  }}
                >
                  {fzone} — {ZONE_LABELS[fzone]}
                </div>
                <div className="mt-2 flex items-center justify-center gap-1 text-xs text-muted">
                  {i === 0 ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  Month +{i + 1}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Main Grid ─────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hero Chart (spans 2 cols) */}
        <Card
          className="lg:col-span-2"
          title="GSSI Timeline"
          subtitle="Historical index (2018–2024) with 3-month forecast"
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDateShort}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  domain={[0, 0.8]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip content={<GSSITooltip />} />

                {/* Stress zone bands */}
                <ReferenceLine y={0.65} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: "HIGH ≥ 0.65", position: "right", fill: "#ef444499", fontSize: 9 }} />
                <ReferenceLine y={0.40} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1} label={{ value: "MED ≥ 0.40", position: "right", fill: "#f59e0b99", fontSize: 9 }} />

                {/* Event annotations */}
                {ANNOTATIONS.map((a) => (
                  <ReferenceLine
                    key={a.date}
                    x={a.date}
                    stroke={a.color}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{
                      value: a.label,
                      position: "top",
                      fill: a.color,
                      fontSize: 9,
                    }}
                  />
                ))}

                {/* Historical GSSI */}
                <Line
                  type="monotone"
                  dataKey="gssi"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="GSSI"
                  connectNulls={false}
                />

                {/* Forecast (dashed) */}
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={{ r: 4, fill: "#22c55e" }}
                  name="Forecast"
                  connectNulls
                />

                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Data Source Sidebar */}
        <Card title="Data Sources" subtitle="7 FRED API Signals">
          <div className="space-y-3">
            {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-lg border border-card-border bg-background px-3 py-2.5"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: SIGNAL_COLORS[key] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {label}
                  </p>
                  <p className="text-[10px] text-muted">
                    Weight:{" "}
                    <span className="font-mono font-semibold">
                      {((data.weights[key] || 0) * 100).toFixed(0)}%
                    </span>
                    {key.includes("stress") && (
                      <span className="ml-1 text-amber-500">(inverted)</span>
                    )}
                  </p>
                </div>
                <Database className="h-3.5 w-3.5 text-muted/40" />
              </div>
            ))}
          </div>
        </Card>

        {/* Leading Indicator: GSSI vs CPI */}
        <Card
          title="Leading Indicator View"
          subtitle="GSSI leads CPI inflation by 3-6 months"
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDateShort}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  yAxisId="gssi"
                  domain={[0, 0.8]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <YAxis
                  yAxisId="cpi"
                  orientation="right"
                  domain={[0, 1]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip content={<GSSITooltip />} />
                <Line
                  yAxisId="gssi"
                  type="monotone"
                  dataKey="gssi"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="GSSI"
                />
                <Line
                  yAxisId="cpi"
                  type="monotone"
                  dataKey="CPI"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                  name="CPI (normalized)"
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Market Volatility: GSSI vs VIX */}
        <Card
          title="Market Volatility View"
          subtitle="GSSI overlaid with the VIX Fear Index"
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDateShort}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  yAxisId="gssi"
                  domain={[0, 0.8]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <YAxis
                  yAxisId="vix"
                  orientation="right"
                  domain={[0, 1]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip content={<GSSITooltip />} />
                <Line
                  yAxisId="gssi"
                  type="monotone"
                  dataKey="gssi"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="GSSI"
                />
                <Line
                  yAxisId="vix"
                  type="monotone"
                  dataKey="VIX"
                  stroke="#eab308"
                  strokeWidth={1.5}
                  dot={false}
                  name="VIX (normalized)"
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Component Contribution (Stacked Area) */}
        <Card
          title="Component Contribution"
          subtitle="Weighted signal impact on GSSI"
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={componentData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDateShort}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => v.toFixed(2)}
                />
                <Tooltip content={<GSSITooltip />} />
                {Object.keys(SIGNAL_COLORS).map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="1"
                    stroke={SIGNAL_COLORS[key]}
                    fill={SIGNAL_COLORS[key]}
                    fillOpacity={0.6}
                    name={key.replace("_stress", "")}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── Portfolio Recommendations ─────────────────────────────────── */}
      <Card
        className="mt-6"
        title="Portfolio Recommendations"
        subtitle={`Dynamic actions based on current zone: ${zone}`}
      >
        <div
          className="mb-4 flex items-center gap-3 rounded-lg border px-4 py-3"
          style={{
            borderColor: zoneColor(zone) + "44",
            background: zoneColor(zone) + "08",
          }}
        >
          {zone === "HIGH" ? (
            <AlertTriangle className="h-5 w-5" style={{ color: zoneColor(zone) }} />
          ) : zone === "MEDIUM" ? (
            <Shield className="h-5 w-5" style={{ color: zoneColor(zone) }} />
          ) : (
            <Zap className="h-5 w-5" style={{ color: zoneColor(zone) }} />
          )}
          <span className="text-sm font-semibold" style={{ color: zoneColor(zone) }}>
            {zone} Stress Regime — {ZONE_LABELS[zone]}
          </span>
          <span className="ml-auto font-mono text-sm text-muted">
            GSSI = {data.current.gssi.toFixed(4)}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-card-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-background">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Action
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Rationale
                </th>
              </tr>
            </thead>
            <tbody>
              {(PORTFOLIO_ACTIONS[zone] || []).map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-card-border last:border-0 hover:bg-card-border/20 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <span className="mr-2">{row.icon}</span>
                    {row.action}
                  </td>
                  <td className="px-4 py-3 text-muted">{row.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="mt-8 border-t border-card-border pt-4 text-center text-xs text-muted/60">
        GSSI Dashboard &middot; Data from FRED API &middot; Two-stage
        residual forecast model (HuberRegressor) &middot; Walk-forward
        validated &middot; FinHack 2026
      </footer>
    </div>
  );
}
