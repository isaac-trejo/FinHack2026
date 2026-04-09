import { fmtDate } from "../lib/helpers";

export function GSSITooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-card-border bg-tooltip-bg p-3 shadow-xl">
      <p className="mb-1.5 text-xs font-medium text-tooltip-sub">
        {fmtDate(label)}
      </p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-tooltip-sub">{p.name}:</span>
          <span className="font-mono font-semibold text-tooltip-text">
            {typeof p.value === "number" ? p.value.toFixed(4) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
