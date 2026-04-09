import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
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
      className=""
      title="GSSI Timeline"
      subtitle="Historical index with 3-month forecast — zone bands show LOW / MEDIUM / HIGH thresholds"
    >
      <div className="h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />

            {/* Zone background bands */}
            <ReferenceArea y1={0} y2={0.40} fill="#22c55e" fillOpacity={0.04} />
            <ReferenceArea y1={0.40} y2={0.65} fill="#f59e0b" fillOpacity={0.05} />
            <ReferenceArea y1={0.65} y2={0.85} fill="#ef4444" fillOpacity={0.05} />

            <XAxis
              dataKey="date"
              tickFormatter={fmtDateShort}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[0, 0.85]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip content={<GSSITooltip />} />

            <ReferenceLine y={0.65} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: "HIGH ≥ 0.65", position: "right", fill: "#ef444480", fontSize: 9 }} />
            <ReferenceLine y={0.40} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1} label={{ value: "MED ≥ 0.40", position: "right", fill: "#f59e0b80", fontSize: 9 }} />

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
                  fontWeight: 600,
                }}
              />
            ))}

            <Line
              type="monotone"
              dataKey="gssi"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={false}
              name="GSSI (Historical)"
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#22c55e"
              strokeWidth={2.5}
              strokeDasharray="8 4"
              dot={{ r: 4, fill: "#22c55e", strokeWidth: 2, stroke: "#141920" }}
              name="Forecast (3-month)"
              connectNulls
            />

            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
