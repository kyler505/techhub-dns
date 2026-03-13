import type { ReactNode } from "react";
import { Activity } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { WorkflowDailyTrendDataPoint } from "../../api/analytics";

interface WorkflowDailyLineChartProps {
  data: WorkflowDailyTrendDataPoint[];
  loading?: boolean;
}

export default function WorkflowDailyLineChart({ data, loading }: WorkflowDailyLineChartProps) {
  if (loading) {
    return (
      <div className="flex h-[320px] w-full items-center justify-center rounded bg-muted/20 animate-pulse">
        <p className="text-muted-foreground">Loading chart...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[320px] w-full flex-col items-center justify-center rounded bg-muted/20">
        <Activity className="mb-2 h-6 w-6 text-slate-300" />
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="4 6" className="stroke-muted/40" />
        <XAxis
          dataKey="date"
          className="text-xs"
          tickFormatter={(value: string | number) => {
            const date = new Date(value);
            return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <YAxis className="text-xs" allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
          }}
          labelFormatter={(label: ReactNode) => {
            if (typeof label !== "string" && typeof label !== "number") {
              return "";
            }
            const date = new Date(label);
            if (Number.isNaN(date.getTime())) {
              return String(label);
            }
            return date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="shipped_count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5 }}
          name="Shipped"
        />
        <Line
          type="monotone"
          dataKey="delivered_count"
          stroke="hsl(var(--secondary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5 }}
          name="Delivered"
        />
        <Line
          type="monotone"
          dataKey="fulfilled_count"
          stroke="hsl(var(--accent))"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5 }}
          name="Fulfilled/Completed"
        />
        <Line
          type="monotone"
          dataKey="picked_count"
          stroke="hsl(var(--secondary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5 }}
          name="Picked"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
