"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { ZONE_LABELS } from "../lib/constants";
import { zoneColor, fmtDate, computeTrend, generateInsight } from "../lib/helpers";
import type { DashboardData } from "../lib/types";
import { ThemeToggle } from "./ThemeToggle";

function AnimatedNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame: number;
    const duration = 900;
    const start = performance.now();
    const from = display;
    const to = value;

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setDisplay(from + (to - from) * ease);
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display.toFixed(decimals)}</>;
}

export function HeroSection({ data }: { data: DashboardData }) {
  const { gssi, zone, date } = data.current;
  const trend = computeTrend(data.history);
  const insight = generateInsight(data);
  const color = zoneColor(zone);

  return (
    <section className="mb-8">
      {/* Top bar */}
      <div className="mb-4 flex items-center gap-2 text-xs text-muted">
        <Activity className="h-4 w-4 text-blue-500" />
        <span className="font-semibold uppercase tracking-widest text-foreground/80">
          Global Supply Chain Stress Index
        </span>
        <span className="mx-1 opacity-40">|</span>
        <span>Updated {fmtDate(date)}</span>
        <span className="ml-auto">
          <ThemeToggle />
        </span>
      </div>

      {/* Hero card */}
      <div
        className="relative overflow-hidden rounded-2xl border p-6 sm:p-8 transition-all duration-500"
        style={{
          borderColor: color + "30",
          background: `conic-gradient(from 135deg, ${color}08 0%, ${color}03 100%)`,
        }}
      >
        {/* Glow accent */}
        <div
          className="absolute -top-20 -right-20 h-60 w-60 rounded-full blur-3xl opacity-20"
          style={{ background: color }}
        />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          {/* Left: GSSI Value */}
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted">
              Current Reading
            </p>
            <div className="flex items-baseline gap-3">
              <span
                className="text-6xl sm:text-7xl font-black font-mono tracking-tight leading-none animate-fade-in"
                style={{ color }}
              >
                <AnimatedNumber value={gssi} decimals={2} />
              </span>
              <span
                className="text-2xl font-bold"
                style={{ color: trend.direction === "up" ? "#ef4444" : trend.direction === "down" ? "#22c55e" : "#6b7280" }}
              >
                {trend.arrow}
              </span>
              <span className="text-sm font-mono text-muted">
                {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(4)} MoM
              </span>
            </div>

            {/* Zone badge */}
            <div className="mt-3 flex items-center gap-3">
              <div
                className="rounded-lg px-4 py-1.5 text-sm font-bold uppercase tracking-wider"
                style={{ background: color + "20", color }}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: color }} />
                {zone} STRESS
              </div>
              <span className="text-sm text-muted/80">{ZONE_LABELS[zone]}</span>
            </div>
          </div>

          {/* Right: Insight */}
          <div className="max-w-md sm:text-right">
            <p className="text-sm leading-relaxed text-foreground/80">{insight}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
