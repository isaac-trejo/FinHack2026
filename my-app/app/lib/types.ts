export interface HistoryRow {
  date: string;
  gssi: number;
  stress_zone: string;
  Oil: number;
  CPI: number;
  PPI: number;
  VIX: number;
  Freight_stress: number;
  Imports_stress: number;
  MFG_stress: number;
}

export interface ForecastRow {
  date: string;
  predicted_gssi: number;
  zone: string;
}

export interface DashboardData {
  current: { date: string; gssi: number; zone: string };
  history: HistoryRow[];
  forecast: ForecastRow[];
  weights: Record<string, number>;
  metrics: Record<string, unknown>;
}
