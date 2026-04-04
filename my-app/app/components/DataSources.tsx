import { Database } from "lucide-react";
import { SIGNAL_LABELS, SIGNAL_COLORS } from "../lib/constants";
import { Card } from "./Card";

export function DataSources({ weights }: { weights: Record<string, number> }) {
  return (
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
                  {((weights[key] || 0) * 100).toFixed(0)}%
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
  );
}
