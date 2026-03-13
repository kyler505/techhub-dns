import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/Skeleton";
import { Order } from "../types/order";
import LiveDeliveryDashboard from "../components/LiveDeliveryDashboard";
import WorkflowDailyLineChart from "../components/charts/WorkflowDailyLineChart";
import FulfilledTotalsBarChart from "../components/charts/FulfilledTotalsBarChart";
import { Activity, Package, CheckCircle2, Truck } from "lucide-react";
import { SectionErrorBoundary } from "../components/error-boundaries/AppErrorBoundaries";
import {
  analyticsQueryKeys,
  getDeliveredOrdersQueryOptions,
  getDeliveryPerformanceQueryOptions,
  getMonthlyFulfilledTotalsQueryOptions,
  getOrderStatusCountsQueryOptions,
  getWorkflowDailyTrendsQueryOptions,
  getYearlyFulfilledTotalsQueryOptions,
} from "../queries/analytics";
import { shouldThrowToBoundary } from "../utils/apiErrors";

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
    slate: "bg-foreground text-background",
    green: "bg-emerald-600 text-white",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="group"
    >
      <Card className="relative overflow-hidden" data-transition="card-hover">
        <div className={`absolute bottom-0 right-0 p-3 rounded-tl-2xl ${accentClasses[accent]} opacity-90 transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="w-5 h-5" />
        </div>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <motion.div
              className="text-3xl font-bold text-foreground"
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [workflowTrendDays, setWorkflowTrendDays] = useState<7 | 30>(() => {
    const value = searchParams.get("workflowRange");
    return value === "7" ? 7 : 30;
  });
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  const socketRef = useRef<Socket | null>(null);
  const socketReconnectTimeoutRef = useRef<number | null>(null);
  const lastSocketRefreshRef = useRef(0);
  const socketRefreshInFlightRef = useRef(false);
  const workflowTrendDaysRef = useRef<7 | 30>(30);
  const queryClient = useQueryClient();

  const statusCountsQuery = useQuery({
    ...getOrderStatusCountsQueryOptions(),
    throwOnError: shouldThrowToBoundary,
  });
  const deliveryPerformanceQuery = useQuery({
    ...getDeliveryPerformanceQueryOptions(),
    throwOnError: shouldThrowToBoundary,
  });
  const workflowDailyTrendsQuery = useQuery({
    ...getWorkflowDailyTrendsQueryOptions(workflowTrendDays),
    throwOnError: shouldThrowToBoundary,
  });
  const monthlyFulfilledTotalsQuery = useQuery({
    ...getMonthlyFulfilledTotalsQueryOptions(),
    throwOnError: shouldThrowToBoundary,
  });
  const yearlyFulfilledTotalsQuery = useQuery({
    ...getYearlyFulfilledTotalsQueryOptions(),
    throwOnError: shouldThrowToBoundary,
  });
  const deliveredOrdersQuery = useQuery({
    ...getDeliveredOrdersQueryOptions(),
    throwOnError: shouldThrowToBoundary,
  });

  const statusCounts = statusCountsQuery.data ?? {};
  const deliveryPerf = deliveryPerformanceQuery.data ?? {
    active_runs: 0,
    completed_today: 0,
    ready_for_delivery: 0,
  };
  const workflowDailyTrends = workflowDailyTrendsQuery.data?.data ?? [];
  const monthlyFulfilledTotals = monthlyFulfilledTotalsQuery.data?.data ?? [];
  const yearlyFulfilledTotals = yearlyFulfilledTotalsQuery.data?.data ?? [];

  const completedTodayOrders = useMemo((): Order[] => {
    const deliveredOrders = deliveredOrdersQuery.data ?? [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return deliveredOrders
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
  }, [deliveredOrdersQuery.data]);

  const statusLoading = statusCountsQuery.isPending;
  const perfLoading = deliveryPerformanceQuery.isPending;
  const trendsLoading = workflowDailyTrendsQuery.isPending || monthlyFulfilledTotalsQuery.isPending || yearlyFulfilledTotalsQuery.isPending;
  const completedLoading = deliveredOrdersQuery.isPending;
  const error =
    statusCountsQuery.isError
    || deliveryPerformanceQuery.isError
    || workflowDailyTrendsQuery.isError
    || monthlyFulfilledTotalsQuery.isError
    || yearlyFulfilledTotalsQuery.isError
    || deliveredOrdersQuery.isError
      ? "Failed to load dashboard data"
      : null;

  useEffect(() => {
    workflowTrendDaysRef.current = workflowTrendDays;
  }, [workflowTrendDays]);

  useEffect(() => {
    const value = searchParams.get("workflowRange");
    const next = value === "7" ? 7 : 30;
    if (next !== workflowTrendDays) {
      setWorkflowTrendDays(next);
    }
  }, [searchParams]);

  const updateWorkflowTrendDays = useCallback(
    (next: 7 | 30) => {
      if (next === workflowTrendDays) {
        return;
      }

      setWorkflowTrendDays(next);

      const updated = new URLSearchParams(searchParams);
      updated.set("workflowRange", String(next));
      setSearchParams(updated, { replace: true });
    },
    [searchParams, setSearchParams, workflowTrendDays],
  );

  const refetchDashboardData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: analyticsQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: getDeliveredOrdersQueryOptions().queryKey }),
    ]);
  }, [queryClient]);

  const refreshFromSocket = () => {
    const now = Date.now();
    if (socketRefreshInFlightRef.current || now - lastSocketRefreshRef.current < 2000) {
      return;
    }
    socketRefreshInFlightRef.current = true;
    lastSocketRefreshRef.current = now;
    refetchDashboardData().finally(() => {
      socketRefreshInFlightRef.current = false;
    });
  };

  useEffect(() => {
    const intervalMs = socketStatus === "connected" ? 15 * 60 * 1000 : 60 * 1000;
    const interval = window.setInterval(() => {
      void refetchDashboardData();
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [refetchDashboardData, socketStatus]);

  // Setup Socket.IO for real-time updates
  useEffect(() => {
    // Build Socket.IO URL
    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    let socket: Socket | null = null;
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
    }

    if (!socket) {
      setSocketStatus("disconnected");
      return () => {
        if (socketReconnectTimeoutRef.current) {
          window.clearTimeout(socketReconnectTimeoutRef.current);
        }
        const currentSocket = socketRef.current;
        if (currentSocket) {
          currentSocket.disconnect();
          socketRef.current = null;
        }
      };
    }

    socket.on("connect", () => {
      console.debug("Dashboard Socket.IO connected");
      setSocketStatus("connected");
      if (socketReconnectTimeoutRef.current) {
        window.clearTimeout(socketReconnectTimeoutRef.current);
        socketReconnectTimeoutRef.current = null;
      }
      socket.emit("join", { room: "orders" });
    });

    // Listen for orders_update and active_runs events - refetch all metrics
    socket.on("orders_update", () => {
      console.debug("Orders updated, refetching analytics");
      refreshFromSocket();
    });

    socket.on("active_runs", () => {
      console.debug("Active runs updated, refetching analytics");
      refreshFromSocket();
    });

    socket.on("disconnect", () => {
      console.debug("Dashboard Socket.IO disconnected");
      setSocketStatus("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.debug("Dashboard Socket.IO error (expected if backend not running)", err);
      setSocketStatus("connecting");
      if (socketReconnectTimeoutRef.current) {
        window.clearTimeout(socketReconnectTimeoutRef.current);
        socketReconnectTimeoutRef.current = null;
      }
      socketReconnectTimeoutRef.current = window.setTimeout(() => {
        if (!socketRef.current?.connected) {
          setSocketStatus("disconnected");
        }
      }, 6000);
    });

    return () => {
      if (socketReconnectTimeoutRef.current) {
        window.clearTimeout(socketReconnectTimeoutRef.current);
      }
      try {
        const currentSocket = socketRef.current;
        if (currentSocket) {
          currentSocket.disconnect();
          socketRef.current = null;
        }
      } catch (_e) {}
    };
  }, [refetchDashboardData]);

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
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        </div>
      </motion.div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive rounded-lg p-4">
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        <Card className="xl:col-span-2 h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Live Status</CardTitle>
            <span
              className={`text-xs text-muted-foreground${socketStatus === "connected" ? " status-live" : ""}`}
            >
              {socketStatus === "connecting" && "Connecting"}
              {socketStatus === "connected" && "Connected"}
              {socketStatus === "disconnected" && "Disconnected"}
            </span>
          </CardHeader>
          <CardContent>
            <SectionErrorBoundary
              title="Live delivery widget failed"
              message="Try the live status panel again. The rest of the dashboard is still available."
            >
              <LiveDeliveryDashboard />
            </SectionErrorBoundary>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Completed Today</CardTitle>
            <span className="text-xs text-muted-foreground">Last 24h</span>
          </CardHeader>
          <CardContent>
            {completedLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : completedTodayOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[320px] text-muted-foreground">
                <CheckCircle2 className="h-7 w-7 text-muted-foreground/40 mb-3" />
                <p className="text-sm">No completed orders today</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {completedTodayOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between text-sm">
                    <Link
                      to={`/orders/${order.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      {order.inflow_order_id || order.id.slice(0, 8)}
                    </Link>
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
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Orders Daily Workflow</CardTitle>
              <p className="text-xs text-muted-foreground">Last {workflowTrendDays} days</p>
            </div>
            <div className="flex items-center gap-1 rounded-md border p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={workflowTrendDays === 7 ? "default" : "ghost"}
                  onClick={() => updateWorkflowTrendDays(7)}
                  className="h-7 px-2"
                >
                  7d
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={workflowTrendDays === 30 ? "default" : "ghost"}
                  onClick={() => updateWorkflowTrendDays(30)}
                  className="h-7 px-2"
                >
                  30d
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            <SectionErrorBoundary
              title="Workflow chart failed"
              message="Try reloading this chart. The rest of the dashboard data is still available."
              resetKeys={[workflowTrendDays]}
            >
              <WorkflowDailyLineChart data={workflowDailyTrends} loading={trendsLoading} />
            </SectionErrorBoundary>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Fulfilled Totals</CardTitle>
            <p className="text-xs text-muted-foreground">Last 12 months</p>
          </CardHeader>
          <CardContent>
            <SectionErrorBoundary
              title="Monthly totals chart failed"
              message="Try reloading the monthly fulfilled totals chart."
            >
              <FulfilledTotalsBarChart data={monthlyFulfilledTotals} loading={trendsLoading} />
            </SectionErrorBoundary>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yearly Fulfilled Totals</CardTitle>
            <p className="text-xs text-muted-foreground">Last 5 years</p>
          </CardHeader>
          <CardContent>
            <SectionErrorBoundary
              title="Yearly totals chart failed"
              message="Try reloading the yearly fulfilled totals chart."
            >
              <FulfilledTotalsBarChart data={yearlyFulfilledTotals} loading={trendsLoading} />
            </SectionErrorBoundary>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
