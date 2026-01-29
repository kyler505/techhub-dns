import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { analyticsApi, StatusCountsResponse, DeliveryPerformanceResponse, TimeTrendDataPoint } from "../api/analytics";
import { ordersApi } from "../api/orders";
import { Order, OrderStatus } from "../types/order";
import LiveDeliveryDashboard from "../components/LiveDeliveryDashboard";
import OrdersLineChart from "../components/charts/OrdersLineChart";
import OrdersBarChart from "../components/charts/OrdersBarChart";

export default function Dashboard() {
  // State for analytics data
  const [statusCounts, setStatusCounts] = useState<StatusCountsResponse>({});
  const [deliveryPerf, setDeliveryPerf] = useState<DeliveryPerformanceResponse>({
    active_runs: 0,
    completed_today: 0,
    ready_for_delivery: 0,
  });
  const [timeTrends, setTimeTrends] = useState<TimeTrendDataPoint[]>([]);
  const [completedTodayOrders, setCompletedTodayOrders] = useState<Order[]>([]);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  // Loading states
  const [statusLoading, setStatusLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [completedLoading, setCompletedLoading] = useState(true);

  // Error states
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Fetch all analytics data
  const fetchAnalytics = async () => {
    try {
      setError(null);
      setStatusLoading(true);
      setPerfLoading(true);
      setTrendsLoading(true);
      setCompletedLoading(true);
      
      // Fetch all data in parallel
      const [counts, perf, trends, deliveredOrders] = await Promise.all([
        analyticsApi.getOrderStatusCounts().catch(() => ({})),
        analyticsApi.getDeliveryPerformance().catch(() => ({
          active_runs: 0,
          completed_today: 0,
          ready_for_delivery: 0,
        })),
        analyticsApi.getTimeTrends("day", 7).catch(() => ({ period: "day", data: [] })),
        ordersApi.getOrders({ status: OrderStatus.DELIVERED }).catch(() => []),
      ]);

      setStatusCounts(counts);
      setDeliveryPerf(perf);
      setTimeTrends(trends.data || []);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const completedToday = (deliveredOrders || [])
        .filter((order) => {
          if (!order.signature_captured_at) return false;
          const signatureDate = new Date(order.signature_captured_at);
          signatureDate.setHours(0, 0, 0, 0);
          return signatureDate.getTime() === todayStart.getTime();
        })
        .sort((a, b) => {
          const aTime = a.signature_captured_at ? new Date(a.signature_captured_at).getTime() : 0;
          const bTime = b.signature_captured_at ? new Date(b.signature_captured_at).getTime() : 0;
          return bTime - aTime;
        });
      setCompletedTodayOrders(completedToday);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      setError("Failed to load dashboard data");
    } finally {
      setStatusLoading(false);
      setPerfLoading(false);
      setTrendsLoading(false);
      setCompletedLoading(false);
    }
  };

  // Setup Socket.IO for real-time updates
  useEffect(() => {
    // Initial data fetch
    fetchAnalytics();

    // Build Socket.IO URL
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    
    let socket: Socket;
    try {
      socket = io(baseUrl, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;
    } catch (e) {
      console.debug("Socket.IO connection failed (expected if backend not running)", e);
      return;
    }

    socket.on("connect", () => {
      console.debug("Dashboard Socket.IO connected");
      socket.emit("join", { room: "orders" });
    });

    // Listen for orders_update and active_runs events - refetch all metrics
    socket.on("orders_update", () => {
      console.debug("Orders updated, refetching analytics");
      fetchAnalytics();
    });

    socket.on("active_runs", () => {
      console.debug("Active runs updated, refetching analytics");
      fetchAnalytics();
    });

    socket.on("disconnect", () => {
      console.debug("Dashboard Socket.IO disconnected");
    });

    socket.on("connect_error", (err) => {
      console.debug("Dashboard Socket.IO error (expected if backend not running)", err);
    });

    // Refresh every 60 seconds as backup
    const interval = setInterval(fetchAnalytics, 60000);

    return () => {
      clearInterval(interval);
      try {
        socket?.disconnect();
      } catch (e) {}
    };
  }, []);

  const formatSignatureTime = (timestamp?: string) => {
    if (!timestamp) return "-";
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return "-";
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive rounded-lg p-4">
          <p className="font-medium">{error}</p>
          <button 
            onClick={fetchAnalytics}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Overview row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <Card className="lg:col-span-2 h-full">
          <CardHeader>
            <CardTitle>Live Status</CardTitle>
          </CardHeader>
          <CardContent>
            <LiveDeliveryDashboard />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Picked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statusLoading ? "..." : (statusCounts.picked ?? 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{perfLoading ? "..." : deliveryPerf.active_runs}</div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{perfLoading ? "..." : deliveryPerf.completed_today}</div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ready for Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{perfLoading ? "..." : deliveryPerf.ready_for_delivery}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Completed Today</CardTitle>
          </CardHeader>
          <CardContent>
            {completedLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : completedTodayOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No completed orders today</div>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {completedTodayOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between text-sm">
                    <div className="font-medium">{order.inflow_order_id || order.id.slice(0, 8)}</div>
                    <div className="text-muted-foreground">
                      {formatSignatureTime(order.signature_captured_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Orders Run (Last 7 Days)</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={chartType === "line" ? "default" : "outline"}
                onClick={() => setChartType("line")}
              >
                Line
              </Button>
              <Button
                size="sm"
                variant={chartType === "bar" ? "default" : "outline"}
                onClick={() => setChartType("bar")}
              >
                Bar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {chartType === "line" ? (
              <OrdersLineChart data={timeTrends} loading={trendsLoading} />
            ) : (
              <OrdersBarChart data={timeTrends} loading={trendsLoading} />
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
