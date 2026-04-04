import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { ANNOTATIONS } from "../lib/constants";
import { fmtDateShort } from "../lib/helpers";
import { GSSITooltip } from "./GSSITooltip";
import { Card } from "./Card";

interface TimelineRow {
  date: string;
  gssi: number | null;
  forecast: number | null;
  zone: string;
}

export function TimelineChart({ data }: { data: TimelineRow[] }) {
  return (
    <Card
      className="lg:col-span-2"
      title="GSSI Timeline"
      subtitle="Historical index (2018–2024) with 3-month forecast"
    >
      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDateShort}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[0, 0.8]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip content={<GSSITooltip />} />

            <ReferenceLine y={0.65} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: "HIGH ≥ 0.65", position: "right", fill: "#ef444499", fontSize: 9 }} />
            <ReferenceLine y={0.40} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1} label={{ value: "MED ≥ 0.40", position: "right", fill: "#f59e0b99", fontSize: 9 }} />

            {ANNOTATIONS.map((a) => (
              <ReferenceLine
                key={a.date}
                x={a.date}
                stroke={a.color}
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{
                  value: a.label,
                  position: "top",
                  fill: a.color,
                  fontSize: 9,
                }}
              />
            ))}

            <Line
              type="monotone"
              dataKey="gssi"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="GSSI"
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={{ r: 4, fill: "#22c55e" }}
              name="Forecast"
              connectNulls
            />

            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
