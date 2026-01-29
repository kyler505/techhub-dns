import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
      <div className="w-full h-[300px] flex items-center justify-center bg-muted/20 rounded">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px'
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
          stroke="#500000" 
          strokeWidth={2}
          dot={{ fill: '#500000', r: 4 }}
          activeDot={{ r: 6 }}
          name="Delivered"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
