import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { ZONE_LABELS } from "../lib/constants";
import { fmtDate, zoneColor } from "../lib/helpers";
import { Card } from "./Card";
import type { ForecastRow } from "../lib/types";

function forecastTrend(forecast: ForecastRow[]): {
  label: string;
  color: string;
  icon: "up" | "down" | "flat";
} {
  if (forecast.length < 2) return { label: "Stable", color: "#6b7280", icon: "flat" };
  const first = forecast[0].predicted_gssi;
  const last = forecast[forecast.length - 1].predicted_gssi;
  const diff = last - first;
  if (diff > 0.02) return { label: "Increasing Risk", color: "#ef4444", icon: "up" };
  if (diff < -0.02) return { label: "Cooling Off", color: "#22c55e", icon: "down" };
  return { label: "Stable Outlook", color: "#f59e0b", icon: "flat" };
}

export function ForecastSpotlight({ forecast, currentGssi }: { forecast: ForecastRow[]; currentGssi: number }) {
  const trend = forecastTrend(forecast);

  return (
    <Card
      title="3-Month Outlook"
      subtitle="ML-driven forecast — where stress is heading"
    >
      {/* Trend summary banner */}
      <div
        className="mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5"
        style={{ background: trend.color + "12", borderLeft: `3px solid ${trend.color}` }}
      >
        {trend.icon === "up" ? (
          <TrendingUp className="h-4 w-4" style={{ color: trend.color }} />
        ) : trend.icon === "down" ? (
          <TrendingDown className="h-4 w-4" style={{ color: trend.color }} />
        ) : (
          <ArrowRight className="h-4 w-4" style={{ color: trend.color }} />
        )}
        <span className="text-sm font-semibold" style={{ color: trend.color }}>
          {trend.label}
        </span>
        <span className="ml-auto text-xs text-muted">
          {currentGssi.toFixed(2)} → {forecast[forecast.length - 1]?.predicted_gssi.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {forecast.map((f, i) => {
          const fzone = f.zone;
          const delta = i === 0
            ? f.predicted_gssi - currentGssi
            : f.predicted_gssi - forecast[i - 1].predicted_gssi;
          return (
            <div
              key={f.date}
              className="group rounded-lg border border-card-border bg-background p-4 text-center transition-all hover:border-card-border/60 hover:bg-card-border/10"
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Month +{i + 1}
              </p>
              <p className="text-xs text-muted/70">{fmtDate(f.date)}</p>
              <p
                className="mt-2 text-3xl font-black font-mono leading-none"
                style={{ color: zoneColor(fzone) }}
              >
                {f.predicted_gssi.toFixed(2)}
              </p>
              <div className="mt-1 font-mono text-xs" style={{ color: delta > 0 ? "#ef4444" : "#22c55e" }}>
                {delta >= 0 ? "+" : ""}{delta.toFixed(4)}
              </div>
              <div
                className="mt-2 inline-block rounded-full px-3 py-0.5 text-[10px] font-bold uppercase"
                style={{
                  background: zoneColor(fzone) + "20",
                  color: zoneColor(fzone),
                }}
              >
                {fzone}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
