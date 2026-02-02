import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Layers } from "lucide-react";
import { TimeTrendDataPoint } from "../../api/analytics";

interface StatusTrendsChartProps {
  data: TimeTrendDataPoint[];
  loading?: boolean;
}

// Color mapping for order statuses (matching StatusBadge colors)
const STATUS_COLORS: { [key: string]: string } = {
  "picked": "#3b82f6",      // blue
  "qa": "#8b5cf6",          // purple
  "pre-delivery": "#f59e0b", // amber
  "in-delivery": "#10b981",  // green
  "shipping": "#06b6d4",     // cyan
  "delivered": "#22c55e",    // emerald
  "issue": "#ef4444",        // red
};

export default function StatusTrendsChart({ data, loading }: StatusTrendsChartProps) {
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
        <Layers className="h-6 w-6 text-slate-300 mb-2" />
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  // Transform data to have status breakdown as separate keys
  const transformedData = data.map(point => ({
    date: point.date,
    ...point.status_breakdown
  }));

  // Get unique statuses from all data points
  const statuses = Array.from(
    new Set(
      data.flatMap(point => 
        point.status_breakdown ? Object.keys(point.status_breakdown) : []
      )
    )
  );

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={transformedData} margin={{ top: 10, right: 24, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="statusGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#500000" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#a61b1b" stopOpacity={0.85} />
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
              day: 'numeric'
            });
          }}
        />
        <Legend />
        {statuses.map(status => (
          <Bar 
            key={status}
            dataKey={status}
            stackId="status"
            fill={STATUS_COLORS[status.toLowerCase()] || "#6b7280"}
            radius={[6, 6, 0, 0]}
            name={status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
