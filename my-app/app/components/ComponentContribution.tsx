import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { SIGNAL_COLORS } from "../lib/constants";
import { fmtDateShort } from "../lib/helpers";
import { GSSITooltip } from "./GSSITooltip";
import { Card } from "./Card";

export function ComponentContribution({ data }: { data: Record<string, any>[] }) {
  return (
    <Card
      title="Component Contribution"
      subtitle="Weighted signal impact on GSSI"
    >
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDateShort}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip content={<GSSITooltip />} />
            {Object.keys(SIGNAL_COLORS).map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="1"
                stroke={SIGNAL_COLORS[key]}
                fill={SIGNAL_COLORS[key]}
                fillOpacity={0.6}
                name={key.replace("_stress", "")}
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
