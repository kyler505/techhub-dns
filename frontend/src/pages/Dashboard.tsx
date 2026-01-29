import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { analyticsApi, StatusCountsResponse, DeliveryPerformanceResponse, ActivityItem } from "../api/analytics";
import OrdersLineChart from "../components/charts/OrdersLineChart";
import PeakHoursBarChart from "../components/charts/PeakHoursBarChart";
import StatusTrendsChart from "../components/charts/StatusTrendsChart";
import LiveDeliveryDashboard from "../components/LiveDeliveryDashboard";

export default function Dashboard() {
  // State for analytics data
  const [statusCounts, setStatusCounts] = useState<StatusCountsResponse>({});
  const [deliveryPerf, setDeliveryPerf] = useState<DeliveryPerformanceResponse>({
    active_runs: 0,
    completed_today: 0,
    ready_for_delivery: 0,
  });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [timeTrends, setTimeTrends] = useState<any[]>([]);
  const [peakHours, setPeakHours] = useState<any[]>([]);

  // Loading states
  const [statusLoading, setStatusLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);

  // Error states
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Fetch all analytics data
  const fetchAnalytics = async () => {
    try {
      setError(null);
      
      // Fetch all data in parallel
      const [counts, perf, activity, trends] = await Promise.all([
        analyticsApi.getOrderStatusCounts().catch(() => ({})),
        analyticsApi.getDeliveryPerformance().catch(() => ({
          active_runs: 0,
          completed_today: 0,
          ready_for_delivery: 0,
        })),
        analyticsApi.getRecentActivity().catch(() => ({ items: [] })),
        analyticsApi.getTimeTrends("day", 7).catch(() => ({ period: "day", data: [] })),
      ]);

      setStatusCounts(counts);
      setDeliveryPerf(perf);
      setRecentActivity(activity.items || []);
      setTimeTrends(trends.data || []);

      // Calculate peak hours from time trends
      // Group by hour of day (simplified - in production, backend should provide this)
      const hourCounts: { [key: string]: number } = {};
      (trends.data || []).forEach((point: any) => {
        const hour = new Date(point.date).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + point.count;
      });
      const peakHoursData = Object.entries(hourCounts)
        .map(([hour, count]) => ({
          hour: `${hour}:00`,
          count,
        }))
        .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
      setPeakHours(peakHoursData);

    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      setError("Failed to load dashboard data");
    } finally {
      setStatusLoading(false);
      setPerfLoading(false);
      setActivityLoading(false);
      setTrendsLoading(false);
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

  // Helper to format status names
  const formatStatus = (status: string): string => {
    return status
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Helper to format timestamps
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
      });
    } catch {
      return timestamp;
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

      {/* Charts Section - 2 column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Orders per Day (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <OrdersLineChart data={timeTrends} loading={trendsLoading} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Peak Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <PeakHoursBarChart data={peakHours} loading={trendsLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Status Trends - full width */}
      <Card>
        <CardHeader>
          <CardTitle>Status Trends (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusTrendsChart data={timeTrends} loading={trendsLoading} />
        </CardContent>
      </Card>

      {/* Recent Activity - full width */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : recentActivity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No recent activity</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Changed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.slice(0, 20).map((activity, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm">{formatTimestamp(activity.timestamp)}</TableCell>
                    <TableCell className="text-sm font-medium">{formatStatus(activity.type)}</TableCell>
                    <TableCell className="text-sm font-mono">{activity.order_id}</TableCell>
                    <TableCell className="text-sm">{activity.description}</TableCell>
                    <TableCell className="text-sm">{activity.changed_by || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
