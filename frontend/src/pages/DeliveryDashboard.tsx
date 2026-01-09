import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import LiveDeliveryDashboard from "../components/LiveDeliveryDashboard";
import PreDeliveryQueue from "./PreDeliveryQueue";
import InDelivery from "./InDelivery";
import Shipping from "./Shipping";
import PastDeliveryRuns from "./PastDeliveryRuns";
import { ordersApi } from "../api/orders";
import { OrderStatus } from "../types/order";

interface DeliveryStats {
    readyForDelivery: number;
    activeDeliveries: number;
    shippingQueue: number;
    completedToday: number;
}

export default function DeliveryDashboard() {
    const [stats, setStats] = useState<DeliveryStats>({
        readyForDelivery: 0,
        activeDeliveries: 0,
        shippingQueue: 0,
        completedToday: 0,
    });
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setStatsLoading(true);

                // Fetch orders by status to calculate stats
                const [preDeliveryOrders, inDeliveryOrders, shippingOrders, deliveredOrders] = await Promise.all([
                    ordersApi.getOrders({ status: OrderStatus.PRE_DELIVERY }),
                    ordersApi.getOrders({ status: OrderStatus.IN_DELIVERY }),
                    ordersApi.getOrders({ status: OrderStatus.SHIPPING }),
                    ordersApi.getOrders({ status: OrderStatus.DELIVERED }),
                ]);

                // Calculate completed today (orders delivered today)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const completedToday = deliveredOrders.filter(order => {
                    // Use the appropriate completion timestamp based on order type
                    let completionTime = null;

                    // For local deliveries, use signature_captured_at
                    if (order.signature_captured_at) {
                        completionTime = order.signature_captured_at;
                    }
                    // For shipping orders, use shipped_to_carrier_at
                    else if (order.shipped_to_carrier_at) {
                        completionTime = order.shipped_to_carrier_at;
                    }
                    // Fallback to updated_at if neither is available
                    else if (order.updated_at) {
                        completionTime = order.updated_at;
                    }

                    if (!completionTime) return false;
                    const completionDate = new Date(completionTime);
                    completionDate.setHours(0, 0, 0, 0);
                    return completionDate.getTime() === today.getTime();
                }).length;

                setStats({
                    readyForDelivery: preDeliveryOrders.length,
                    activeDeliveries: inDeliveryOrders.length,
                    shippingQueue: shippingOrders.length,
                    completedToday,
                });
            } catch (error) {
                console.error("Failed to fetch delivery stats:", error);
            } finally {
                setStatsLoading(false);
            }
        };

        fetchStats();

        // Refresh stats every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);
    return (
        <div className="container mx-auto py-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Delivery Dashboard</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Live Delivery Overview */}
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle>Live Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <LiveDeliveryDashboard />
                        </CardContent>
                    </Card>
                </div>

                {/* Main Delivery Operations */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle>Operations</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="pre-delivery" className="w-full">
                                <TabsList className="grid w-full grid-cols-4">
                                    <TabsTrigger value="pre-delivery">Pre-Delivery</TabsTrigger>
                                    <TabsTrigger value="in-delivery">In Delivery</TabsTrigger>
                                    <TabsTrigger value="shipping">Shipping</TabsTrigger>
                                    <TabsTrigger value="history">History</TabsTrigger>
                                </TabsList>

                                <TabsContent value="pre-delivery" className="mt-4">
                                    <PreDeliveryQueue />
                                </TabsContent>

                                <TabsContent value="in-delivery" className="mt-4">
                                    <InDelivery />
                                </TabsContent>

                                <TabsContent value="shipping" className="mt-4">
                                    <Shipping />
                                </TabsContent>

                                <TabsContent value="history" className="mt-4">
                                    <PastDeliveryRuns />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Delivery Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Ready for Delivery</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{statsLoading ? "..." : stats.readyForDelivery}</div>

                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Active Deliveries</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{statsLoading ? "..." : stats.activeDeliveries}</div>

                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Shipping Queue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{statsLoading ? "..." : stats.shippingQueue}</div>

                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{statsLoading ? "..." : stats.completedToday}</div>

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
