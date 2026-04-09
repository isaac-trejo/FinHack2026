import Image from "next/image";
import { ZONE_LABELS } from "../lib/constants";
import { fmtDate, zoneColor } from "../lib/helpers";
import type { DashboardData } from "../lib/types";

export function Header({ data }: { data: DashboardData }) {
  const zone = data.current.zone;

  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Image src="/LogoGSSI.png" alt="GSSI Logo" width={40} height={40} className="logo-dark" />
        <Image src="/LogoGSSILight.png" alt="GSSI Logo" width={40} height={40} className="logo-light" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Global Supply Chain Stress Index
          </h1>
          <p className="text-xs text-muted">
            7-signal composite &middot; FRED API &middot; Updated{" "}
            {fmtDate(data.current.date)}
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-3 rounded-xl border px-5 py-3"
        style={{
          borderColor: zoneColor(zone) + "44",
          background: zoneColor(zone) + "0a",
        }}
      >
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Current GSSI
          </p>
          <p
            className="text-3xl font-bold font-mono"
            style={{ color: zoneColor(zone) }}
          >
            {data.current.gssi.toFixed(2)}
          </p>
        </div>
        <div
          className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase"
          style={{
            background: zoneColor(zone) + "20",
            color: zoneColor(zone),
          }}
        >
          {zone}
          <span className="block text-[10px] font-normal opacity-80">
            {ZONE_LABELS[zone]}
          </span>
        </div>
      </div>
    </header>
  );
}
