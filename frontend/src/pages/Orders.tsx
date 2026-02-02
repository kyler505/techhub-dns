import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import OrderTable from "../components/OrderTable";
import Filters, { StatusFilter } from "../components/Filters";
import StatusTransition from "../components/StatusTransition";
import { Card, CardContent } from "../components/ui/card";
import { SkeletonTable } from "../components/Skeleton";
import { PackageSearch } from "lucide-react";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";

export default function Orders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>([OrderStatus.PICKED, OrderStatus.QA]);
    const [search, setSearch] = useState("");
    const [transitioningOrder, setTransitioningOrder] = useState<{
        orderId: string;
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);
    const navigate = useNavigate();

    // WebSocket hook for real-time order updates
    const { orders: websocketOrders } = useOrdersWebSocket();
    const lastWebSocketUpdate = useRef<number>(0);

    // Track WebSocket updates and refetch when orders change
    useEffect(() => {
        if (websocketOrders.length > 0) {
            const updateTime = Date.now();
            // Only refetch if this is a new update (not the initial connection)
            if (lastWebSocketUpdate.current > 0) {
                loadOrders();
            }
            lastWebSocketUpdate.current = updateTime;
        }
    }, [websocketOrders]);

    useEffect(() => {
        loadOrders();
    }, [statusFilter, search]);

    const loadOrders = async () => {
        setLoading(true);
        try {
            // Handle array of statuses by fetching each and combining
            if (Array.isArray(statusFilter)) {
                const orderPromises = statusFilter.map(status =>
                    ordersApi.getOrders({
                        status,
                        search: search || undefined,
                    })
                );
                const results = await Promise.all(orderPromises);
                // Combine and sort by updated_at descending
                const combined = results.flat().sort((a, b) =>
                    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                );
                setOrders(combined);
            } else {
                const data = await ordersApi.getOrders({
                    status: statusFilter || undefined,
                    search: search || undefined,
                });
                setOrders(data);
            }
        } catch (error) {
            console.error("Failed to load orders:", error);
        } finally {
            setLoading(false);
            setIsInitialLoad(false);
        }
    };

    const handleStatusChange = (orderId: string, newStatus: OrderStatus, reason?: string) => {
        const requireReason = newStatus === OrderStatus.ISSUE;
        if (requireReason && reason === undefined) {
            setTransitioningOrder({ orderId, newStatus, requireReason: true });
        } else {
            performStatusChange(orderId, newStatus, reason);
        }
    };

    const performStatusChange = async (
        orderId: string,
        newStatus: OrderStatus,
        reason?: string
    ) => {
        try {
            await ordersApi.updateOrderStatus(orderId, { status: newStatus, reason });
            setTransitioningOrder(null);
            loadOrders();
        } catch (error) {
            console.error("Failed to update status:", error);
            alert("Failed to update order status");
        }
    };

    const handleViewDetail = (orderId: string) => {
        navigate(`/orders/${orderId}`);
    };

    if (loading && isInitialLoad) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-2">
                    <div className="text-2xl font-semibold text-slate-900">Orders</div>
                    <div className="text-sm text-slate-500">Loading current workflow queues.</div>
                </div>
                <Card>
                    <div className="p-6 pb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="h-9 w-52 bg-slate-100 rounded-md animate-pulse" />
                            <div className="h-9 w-36 bg-slate-100 rounded-md animate-pulse" />
                        </div>
                    </div>
                    <CardContent>
                        <SkeletonTable rows={6} columns={5} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
                <p className="text-sm text-slate-500">Manage operational orders across all workflow stages.</p>
            </div>

            <Card>
                <div className="p-6 pb-4">
                    <Filters
                        status={statusFilter}
                        onStatusChange={setStatusFilter}
                        search={search}
                        onSearchChange={setSearch}
                    />
                </div>
                <CardContent>
                    <OrderTable
                        orders={orders}
                        onStatusChange={handleStatusChange}
                        onViewDetail={handleViewDetail}
                        showEmptyState={false}
                    />
                </CardContent>
            </Card>
            {!loading && orders.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
                    <PackageSearch className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-700">No orders to display</p>
                    <p className="text-xs text-slate-500">Adjust your filters or clear search to see orders.</p>
                </div>
            )}
            {transitioningOrder && (
                <StatusTransition
                    currentStatus={
                        orders.find((o) => o.id === transitioningOrder.orderId)?.status || OrderStatus.PRE_DELIVERY
                    }
                    newStatus={transitioningOrder.newStatus}
                    requireReason={transitioningOrder.requireReason}
                    onConfirm={(reason) =>
                        performStatusChange(transitioningOrder.orderId, transitioningOrder.newStatus, reason)
                    }
                    onCancel={() => setTransitioningOrder(null)}
                />
            )}
        </div>
    );
}
