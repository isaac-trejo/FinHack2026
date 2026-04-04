import { AlertTriangle, Shield, Zap } from "lucide-react";
import { ZONE_LABELS, PORTFOLIO_ACTIONS } from "../lib/constants";
import { zoneColor } from "../lib/helpers";
import { Card } from "./Card";

export function PortfolioRecommendations({
  zone,
  gssi,
}: {
  zone: string;
  gssi: number;
}) {
  return (
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
          GSSI = {gssi.toFixed(4)}
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
  );
}
