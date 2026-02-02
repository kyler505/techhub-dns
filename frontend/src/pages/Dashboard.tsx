import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/Skeleton";
import { analyticsApi, StatusCountsResponse, DeliveryPerformanceResponse, TimeTrendDataPoint } from "../api/analytics";
import { ordersApi } from "../api/orders";
import { Order, OrderStatus } from "../types/order";
import LiveDeliveryDashboard from "../components/LiveDeliveryDashboard";
import OrdersLineChart from "../components/charts/OrdersLineChart";
import OrdersBarChart from "../components/charts/OrdersBarChart";
import { Activity, Package, CheckCircle2, Truck, RefreshCw } from "lucide-react";

function useAnimatedCounter(target: number, duration: number = 900) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = countRef.current;
    const diff = target - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(startValue + diff * easeOutQuart);

      countRef.current = current;
      setCount(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return count;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  loading: boolean;
  accent?: "maroon" | "slate" | "green";
}

function StatCard({ title, value, icon: Icon, loading, accent = "slate" }: StatCardProps) {
  const animatedValue = useAnimatedCounter(loading ? 0 : value);

  const accentClasses = {
    maroon: "bg-maroon-700 text-white",
    slate: "bg-slate-800 text-white",
    green: "bg-emerald-600 text-white",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="group"
    >
      <Card className="relative overflow-hidden transition-all duration-300 hover:shadow-premium-hover hover:-translate-y-0.5 h-full border-slate-200">
        <div className={`absolute top-0 right-0 p-3 rounded-bl-2xl ${accentClasses[accent]} opacity-90 transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="w-5 h-5" />
        </div>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <motion.div
              className="text-3xl font-bold text-slate-900"
              key={value}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            >
              {animatedValue}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

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
    <div className="container mx-auto py-8 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Live operational snapshot and delivery performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAnalytics} className="btn-lift">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" className="btn-lift">
            <Activity className="mr-2 h-4 w-4" />
            Live View
          </Button>
        </div>
      </motion.div>

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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        <Card className="xl:col-span-2 h-full border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Live Status</CardTitle>
            <span className="status-live text-xs text-slate-500">Connected</span>
          </CardHeader>
          <CardContent>
            <LiveDeliveryDashboard />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
          <StatCard
            title="Picked"
            value={statusCounts.picked ?? 0}
            icon={Package}
            loading={statusLoading}
            accent="slate"
          />
          <StatCard
            title="Ready for QA"
            value={statusCounts.qa ?? 0}
            icon={CheckCircle2}
            loading={statusLoading}
            accent="maroon"
          />
          <StatCard
            title="Completed Today"
            value={deliveryPerf.completed_today}
            icon={Truck}
            loading={perfLoading}
            accent="green"
          />
          <StatCard
            title="Ready for Delivery"
            value={deliveryPerf.ready_for_delivery}
            icon={Activity}
            loading={perfLoading}
            accent="slate"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Completed Today</CardTitle>
            <span className="text-xs text-slate-500">Last 24h</span>
          </CardHeader>
          <CardContent>
            {completedLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : completedTodayOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <CheckCircle2 className="h-7 w-7 text-slate-300 mb-3" />
                <p className="text-sm">No completed orders today</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {completedTodayOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between text-sm">
                    <div className="font-medium text-slate-900">
                      {order.inflow_order_id || order.id.slice(0, 8)}
                    </div>
                    <div className="text-slate-500">
                      {formatSignatureTime(order.signature_captured_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Orders Delivered</CardTitle>
              <p className="text-xs text-slate-500">Last 7 days</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={chartType === "line" ? "default" : "outline"}
                onClick={() => setChartType("line")}
                className="btn-lift"
              >
                Line
              </Button>
              <Button
                size="sm"
                variant={chartType === "bar" ? "default" : "outline"}
                onClick={() => setChartType("bar")}
                className="btn-lift"
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
