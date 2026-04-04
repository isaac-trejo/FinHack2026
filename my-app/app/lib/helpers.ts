import { ZONE_COLORS } from "./constants";

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
