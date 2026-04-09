import { ZONE_COLORS } from "./constants";
import type { DashboardData, HistoryRow } from "./types";

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

export function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

export function zoneColor(zone: string) {
  return ZONE_COLORS[zone as keyof typeof ZONE_COLORS] || "#6b7280";
}

export function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

/** Compute month-over-month trend from history */
export function computeTrend(history: HistoryRow[]): {
  delta: number;
  direction: "up" | "down" | "flat";
  arrow: string;
} {
  if (history.length < 2) return { delta: 0, direction: "flat", arrow: "→" };
  const curr = history[history.length - 1].gssi;
  const prev = history[history.length - 2].gssi;
  const delta = curr - prev;
  const abs = Math.abs(delta);
  if (abs < 0.005) return { delta, direction: "flat", arrow: "→" };
  return delta > 0
    ? { delta, direction: "up", arrow: "↑" }
    : { delta, direction: "down", arrow: "↓" };
}

/** Generate a dynamic one-line insight sentence */
export function generateInsight(data: DashboardData): string {
  const { zone } = data.current;
  const trend = computeTrend(data.history);
  const topDriver = getTopDrivers(data)[0];

  if (zone === "HIGH") {
    if (trend.direction === "up")
      return `Supply chain stress is escalating — ${topDriver.label} is the primary pressure driver.`;
    if (trend.direction === "down")
      return `Stress remains critical but shows early signs of easing. ${topDriver.label} still dominant.`;
    return `Stress is holding at elevated levels. ${topDriver.label} continues to drive pressure.`;
  }
  if (zone === "MEDIUM") {
    if (trend.direction === "up")
      return `Stress is climbing toward critical levels, led by ${topDriver.label}. Monitor closely.`;
    if (trend.direction === "down")
      return `Supply chain stress is stabilizing but remains elevated due to ${topDriver.label} pressures.`;
    return `Stress is moderate and steady. ${topDriver.label} is the key factor to watch.`;
  }
  // LOW
  if (trend.direction === "up")
    return `Stress is low but trending upward — ${topDriver.label} showing early movement.`;
  return `Supply chains are operating normally. No significant stress signals detected.`;
}

/** Rank signals by their weighted contribution, return top drivers with status */
export function getTopDrivers(
  data: DashboardData
): { key: string; label: string; value: number; weighted: number; status: string }[] {
  const LABELS: Record<string, string> = {
    Freight_stress: "Freight",
    Imports_stress: "Imports",
    Oil: "Oil",
    CPI: "CPI",
    PPI: "PPI",
    MFG_stress: "Mfg Employment",
    VIX: "VIX",
  };

  const last = data.history[data.history.length - 1];
  const prev = data.history.length >= 2 ? data.history[data.history.length - 2] : last;

  return Object.entries(data.weights)
    .map(([key, w]) => {
      const val = (last as any)[key] ?? 0;
      const prevVal = (prev as any)[key] ?? 0;
      const diff = val - prevVal;
      let status = "Stable";
      if (diff > 0.03) status = "Rising";
      else if (diff < -0.03) status = "Cooling";
      if (val * w > 0.10) status = val > 0.7 ? "Primary driver" : "Persistent pressure";
      if (val < 0.3) status = "Stabilizing";
      return { key, label: LABELS[key] || key, value: val, weighted: round4(val * w), status };
    })
    .sort((a, b) => b.weighted - a.weighted);
}
