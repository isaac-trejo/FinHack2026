export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const ZONE_COLORS = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
} as const;

export const ZONE_LABELS: Record<string, string> = {
  LOW: "Everything Normal",
  MEDIUM: "Pressure Building",
  HIGH: "Crisis Incoming",
};

export const SIGNAL_COLORS: Record<string, string> = {
  Freight_stress: "#3b82f6",
  Imports_stress: "#8b5cf6",
  Oil: "#f97316",
  CPI: "#ef4444",
  PPI: "#ec4899",
  MFG_stress: "#06b6d4",
  VIX: "#eab308",
};

export const SIGNAL_LABELS: Record<string, string> = {
  Freight_stress: "Freight (TSIFRGHT)",
  Imports_stress: "Imports (IMPGSC1)",
  Oil: "Oil (DCOILWTICO)",
  CPI: "CPI (CPIAUCSL)",
  PPI: "PPI (PPIACO)",
  MFG_stress: "Mfg Employment (MANEMP)",
  VIX: "VIX (VIXCLS)",
};

export const ANNOTATIONS = [
  { date: "2020-03-01", label: "COVID-19", color: "#ef4444" },
  { date: "2021-10-01", label: "Port Congestion", color: "#f59e0b" },
  { date: "2022-02-01", label: "Ukraine War", color: "#ef4444" },
];

export const PORTFOLIO_ACTIONS: Record<
  string,
  { action: string; rationale: string; icon: string }[]
> = {
  HIGH: [
    { action: "Reduce Tech Exposure", rationale: "Supply disruptions hit hardware-dependent sectors first", icon: "↓" },
    { action: "Increase Commodities", rationale: "Supply stress drives commodity prices higher", icon: "↑" },
    { action: "Buy TIPS (Inflation-Protected)", rationale: "Supply shocks propagate to CPI within 3-6 months", icon: "↑" },
    { action: "Overweight Defensive Sectors", rationale: "Utilities and staples outperform in stress regimes", icon: "⬆" },
    { action: "Increase Cash Position", rationale: "Preserve capital for volatility opportunities", icon: "💵" },
  ],
  MEDIUM: [
    { action: "Maintain Balanced Allocation", rationale: "Stress is elevated but not critical — stay diversified", icon: "⚖" },
    { action: "Begin Hedging Positions", rationale: "Options protection becomes cheaper before peak stress", icon: "🛡" },
    { action: "Monitor Freight & Oil Closely", rationale: "These leading indicators determine escalation path", icon: "👁" },
    { action: "Tilt Toward Value Stocks", rationale: "Value outperforms growth during supply-side uncertainty", icon: "↗" },
  ],
  LOW: [
    { action: "Increase Growth / Tech Exposure", rationale: "Stable supply chains favor innovation-driven sectors", icon: "↑" },
    { action: "Reduce Commodity Hedges", rationale: "Low stress means lower input cost pressure", icon: "↓" },
    { action: "Full Risk-On Positioning", rationale: "Historical returns highest when GSSI < 0.35", icon: "🚀" },
    { action: "Extend Duration in Bonds", rationale: "Low supply stress reduces inflation expectations", icon: "📈" },
  ],
};
