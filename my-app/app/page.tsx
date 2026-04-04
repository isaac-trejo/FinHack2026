"use client";

import { useEffect, useState, useMemo } from "react";
import { Activity, Loader2, Play } from "lucide-react";

import { API_BASE } from "./lib/constants";
import { round4 } from "./lib/helpers";
import type { DashboardData } from "./lib/types";

import { Header } from "./components/Header";
import { ForecastSpotlight } from "./components/ForecastSpotlight";
import { TimelineChart } from "./components/TimelineChart";
import { DataSources } from "./components/DataSources";
import { LeadingIndicatorChart } from "./components/LeadingIndicatorChart";
import { MarketVolatilityChart } from "./components/MarketVolatilityChart";
import { ComponentContribution } from "./components/ComponentContribution";
import { PortfolioRecommendations } from "./components/PortfolioRecommendations";
import { Footer } from "./components/Footer";

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
    <div className="min-h-screen bg-background px-4 py-6 font-sans sm:px-6 lg:px-8">
      <Header data={data} />
      <ForecastSpotlight forecast={data.forecast} />

      <div className="grid gap-6 lg:grid-cols-3">
        <TimelineChart data={timelineData} />
        <DataSources weights={data.weights} />
        <LeadingIndicatorChart history={data.history} />
        <MarketVolatilityChart history={data.history} />
        <ComponentContribution data={componentData} />
      </div>

      <PortfolioRecommendations zone={zone} gssi={data.current.gssi} />
      <Footer />
    </div>
  );
}
