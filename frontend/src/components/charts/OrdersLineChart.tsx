import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity } from "lucide-react";
import { TimeTrendDataPoint } from "../../api/analytics";

interface OrdersLineChartProps {
  data: TimeTrendDataPoint[];
  loading?: boolean;
}

export default function OrdersLineChart({ data, loading }: OrdersLineChartProps) {
  if (loading) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center bg-muted/20 rounded animate-pulse">
        <p className="text-muted-foreground">Loading chart...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[300px] flex flex-col items-center justify-center bg-muted/20 rounded">
        <Activity className="h-6 w-6 text-slate-300 mb-2" />
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#500000" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#8b1c1c" stopOpacity={0.9} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 6" className="stroke-muted/40" />
        <XAxis 
          dataKey="date" 
          className="text-xs"
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }}
        />
        <YAxis className="text-xs" />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
          }}
          labelFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-US', { 
              weekday: 'short',
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            });
          }}
        />
        <Line 
          type="monotone" 
          dataKey="count" 
          stroke="url(#lineGradient)" 
          strokeWidth={2.5}
          dot={{ fill: "#500000", r: 4, strokeWidth: 2, stroke: "#fff" }}
          activeDot={{ r: 6, stroke: "#500000", strokeWidth: 2 }}
          name="Delivered"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
