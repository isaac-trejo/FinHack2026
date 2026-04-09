import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SIGNAL_COLORS } from "../lib/constants";
import { getTopDrivers, zoneColor } from "../lib/helpers";
import { Card } from "./Card";
import type { DashboardData } from "../lib/types";

const STATUS_COLORS: Record<string, string> = {
  "Primary driver": "#ef4444",
  "Persistent pressure": "#f59e0b",
  Rising: "#f97316",
  Cooling: "#22c55e",
  Stabilizing: "#22c55e",
  Stable: "#6b7280",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "Primary driver" || status === "Rising" || status === "Persistent pressure")
    return <TrendingUp className="h-3.5 w-3.5" />;
  if (status === "Cooling" || status === "Stabilizing")
    return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

export function StressDrivers({ data }: { data: DashboardData }) {
  const drivers = getTopDrivers(data);

  return (
    <Card title="Stress Drivers" subtitle="What's moving the index right now">
      <div className="space-y-2">
        {drivers.map((d, i) => (
          <div
            key={d.key}
            className="group flex items-center gap-3 rounded-lg border border-card-border bg-background px-3 py-2.5 transition-colors hover:border-card-border/80 hover:bg-card-border/10"
          >
            {/* Rank */}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-muted/60 bg-card-border/40">
              {i + 1}
            </span>

            {/* Color dot */}
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SIGNAL_COLORS[d.key] || "#6b7280" }}
            />

            {/* Label + contribution bar */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{d.label}</span>
                <span className="font-mono text-[10px] text-muted">
                  {(d.weighted * 100).toFixed(1)}%
                </span>
              </div>
              {/* Mini bar */}
              <div className="mt-1 h-1 w-full rounded-full bg-card-border/50">
                <div
                  className="h-1 rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(d.value * 100, 100)}%`,
                    background: SIGNAL_COLORS[d.key] || "#6b7280",
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>

            {/* Status tag */}
            <div
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
              style={{
                color: STATUS_COLORS[d.status] || "#6b7280",
                background: (STATUS_COLORS[d.status] || "#6b7280") + "18",
              }}
            >
              <StatusIcon status={d.status} />
              {d.status}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
