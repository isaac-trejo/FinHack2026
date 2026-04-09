"use client";

import { useEffect, useState, useMemo } from "react";
import { Activity, Loader2, Play } from "lucide-react";

import { API_BASE } from "./lib/constants";
import { round4 } from "./lib/helpers";
import type { DashboardData } from "./lib/types";

import { HeroSection } from "./components/HeroSection";
import { TimelineChart } from "./components/TimelineChart";
import { ForecastSpotlight } from "./components/ForecastSpotlight";
import { StressDrivers } from "./components/StressDrivers";
import { LeadingIndicatorChart } from "./components/LeadingIndicatorChart";
import { MarketVolatilityChart } from "./components/MarketVolatilityChart";
import { ComponentContribution } from "./components/ComponentContribution";
import { PortfolioRecommendations } from "./components/PortfolioRecommendations";
import { DataSources } from "./components/DataSources";
import { Footer } from "./components/Footer";
import { ScrollFadeIn } from "./components/ScrollFadeIn";

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

  const zone = data.current.zone;

  return (
    <div className="min-h-screen bg-background px-4 py-8 font-sans md:px-6 lg:px-8">
      <div className="flex flex-col items-center space-y-14">
        {/* ═══ 1. HERO — What is happening (widest) ═══ */}
        <ScrollFadeIn className="w-full max-w-6xl">
          <HeroSection data={data} />
        </ScrollFadeIn>

        {/* ═══ 2. TIMELINE — Full picture ═══ */}
        <ScrollFadeIn className="w-full max-w-5xl">
          <TimelineChart data={timelineData} />
        </ScrollFadeIn>

        {/* ═══ 3. FORECAST — What will happen next ═══ */}
        <ScrollFadeIn className="w-full max-w-4xl">
          <ForecastSpotlight forecast={data.forecast} currentGssi={data.current.gssi} />
        </ScrollFadeIn>

        {/* ═══ 4. RECOMMENDED ACTIONS — What to do ═══ */}
        <ScrollFadeIn className="w-full max-w-3xl">
          <PortfolioRecommendations zone={zone} gssi={data.current.gssi} />
        </ScrollFadeIn>

        {/* ═══ 5. STRESS DRIVERS — Why it's happening ═══ */}
        <ScrollFadeIn className="w-full max-w-3xl">
          <StressDrivers data={data} />
        </ScrollFadeIn>

        {/* ═══ 6. DEEP DIVE — Supporting analysis ═══ */}
        <ScrollFadeIn className="w-full max-w-4xl">
          <div className="mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted/60">
              Deep Dive
            </h2>
          </div>
          <div className="space-y-6">
            <ScrollFadeIn>
              <LeadingIndicatorChart history={data.history} />
            </ScrollFadeIn>
            <ScrollFadeIn>
              <MarketVolatilityChart history={data.history} />
            </ScrollFadeIn>
            <ScrollFadeIn>
              <ComponentContribution data={componentData} />
            </ScrollFadeIn>
          </div>
        </ScrollFadeIn>

        {/* ═══ 7. DATA SOURCES — Reference (narrowest) ═══ */}
        <ScrollFadeIn className="w-full max-w-2xl">
          <DataSources weights={data.weights} />
        </ScrollFadeIn>
      </div>

      <div className="mx-auto mt-12 max-w-2xl">
        <Footer />
      </div>
    </div>
  );
}
