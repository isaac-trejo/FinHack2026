import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { fmtDateShort } from "../lib/helpers";
import { GSSITooltip } from "./GSSITooltip";
import { Card } from "./Card";
import type { HistoryRow } from "../lib/types";

export function LeadingIndicatorChart({ history }: { history: HistoryRow[] }) {
  return (
    <Card
      title="Leading Indicator View"
      subtitle="GSSI leads CPI inflation by 3-6 months"
    >
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDateShort}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              yAxisId="gssi"
              domain={[0, 0.8]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <YAxis
              yAxisId="cpi"
              orientation="right"
              domain={[0, 1]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip content={<GSSITooltip />} />
            <Line
              yAxisId="gssi"
              type="monotone"
              dataKey="gssi"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="GSSI"
            />
            <Line
              yAxisId="cpi"
              type="monotone"
              dataKey="CPI"
              stroke="#ef4444"
              strokeWidth={1.5}
              dot={false}
              name="CPI (normalized)"
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
