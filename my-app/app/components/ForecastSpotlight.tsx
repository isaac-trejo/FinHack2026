import { ChevronRight, TrendingUp } from "lucide-react";
import { ZONE_LABELS } from "../lib/constants";
import { fmtDate, zoneColor } from "../lib/helpers";
import { Card } from "./Card";
import type { ForecastRow } from "../lib/types";

export function ForecastSpotlight({ forecast }: { forecast: ForecastRow[] }) {
  return (
    <Card
      className="mb-6"
      title="3-Month Windshield Forecast"
      subtitle="Machine-learning residual forecast based on 7 macro signals"
    >
      <div className="grid grid-cols-3 gap-4">
        {forecast.map((f, i) => {
          const fzone = f.zone;
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
  );
}
