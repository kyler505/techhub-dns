import type { ReactNode } from "react";
import { BarChart2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { FulfilledTotalDataPoint } from "../../api/analytics";

interface FulfilledTotalsBarChartProps {
  data: FulfilledTotalDataPoint[];
  loading?: boolean;
}

export default function FulfilledTotalsBarChart({ data, loading }: FulfilledTotalsBarChartProps) {
  if (loading) {
    return (
      <div className="flex h-[220px] w-full items-center justify-center rounded bg-muted/20 animate-pulse overflow-hidden">
        <p className="text-muted-foreground">Loading chart...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[220px] w-full flex-col items-center justify-center rounded bg-muted/20 overflow-hidden">
        <BarChart2 className="mb-2 h-6 w-6 text-slate-300" />
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="4 6" className="stroke-muted/40" />
        <XAxis
          dataKey="period"
          className="text-xs"
          tickFormatter={(value: string | number) => String(value).replace("-", "/")}
        />
        <YAxis className="text-xs" allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
          }}
          labelFormatter={(label: ReactNode) => String(label)}
          formatter={(value: ReactNode) => [value, "Fulfilled"]}
        />
        <Bar dataKey="fulfilled_count" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} name="Fulfilled" />
      </BarChart>
    </ResponsiveContainer>
  );
}
