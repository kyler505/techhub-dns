export const CHART_HEIGHT_CLASS = "h-72 sm:h-80";

export const CHART_COLORS = {
  shipped: "hsl(var(--chart-shipped))",
  delivered: "hsl(var(--chart-delivered))",
  fulfilled: "hsl(var(--chart-fulfilled))",
  picked: "hsl(var(--chart-picked))",
} as const;

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  boxShadow: "0 12px 24px hsl(var(--foreground) / 0.08)",
} as const;
