import { Database } from "lucide-react";
import { SIGNAL_LABELS, SIGNAL_COLORS } from "../lib/constants";
import { Card } from "./Card";

export function DataSources({ weights }: { weights: Record<string, number> }) {
  return (
    <Card title="Data Sources" subtitle="7 FRED macro signals powering the GSSI">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2 transition-colors hover:bg-card-border/10"
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: SIGNAL_COLORS[key] }}
            />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium text-foreground">
                {label}
              </p>
              <p className="text-[9px] text-muted font-mono">
                {((weights[key] || 0) * 100).toFixed(0)}%
                {key.includes("stress") && (
                  <span className="ml-0.5 text-amber-500/70">inv</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
