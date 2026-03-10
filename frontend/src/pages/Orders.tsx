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
import { toast } from "sonner";
import { isValidOrderId } from "../utils/orderIds";

export default function Orders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>([OrderStatus.PICKED, OrderStatus.QA]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [transitioningOrder, setTransitioningOrder] = useState<{
        orderId: string;
        currentStatus: OrderStatus;
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);
    const navigate = useNavigate();

    const compareOrderListPriority = (left: Order, right: Order): number => {
        const updatedAtDelta = Date.parse(right.updated_at) - Date.parse(left.updated_at);
        if (!Number.isNaN(updatedAtDelta) && updatedAtDelta !== 0) {
            return updatedAtDelta;
        }

        const createdAtDelta = Date.parse(right.created_at) - Date.parse(left.created_at);
        if (!Number.isNaN(createdAtDelta) && createdAtDelta !== 0) {
            return createdAtDelta;
        }

        const leftKey = left.inflow_order_id || left.id || "";
        const rightKey = right.inflow_order_id || right.id || "";
        return rightKey.localeCompare(leftKey);
    };

    // WebSocket hook for real-time order updates
    const { orders: websocketOrders } = useOrdersWebSocket();
    const lastWebSocketUpdate = useRef<number>(0);
    const latestRequestId = useRef(0);

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
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [search]);

    useEffect(() => {
        loadOrders();
    }, [statusFilter, debouncedSearch]);

    const loadOrders = async () => {
        const requestId = latestRequestId.current + 1;
        latestRequestId.current = requestId;
        setLoading(true);
        let shouldApply = true;
        try {
            const searchQuery = debouncedSearch.trim();

            // Handle array of statuses by fetching each and combining
            if (Array.isArray(statusFilter)) {
                const results = [];
                for (const status of statusFilter) {
                    results.push(
                        await ordersApi.getOrders({
                            status,
                            search: searchQuery || undefined,
                        })
                    );
                }
                shouldApply = latestRequestId.current === requestId;
                // Combine and sort by updated_at descending
                if (shouldApply) {
                    const combined = results.flat().sort(compareOrderListPriority);
                    setOrders(combined);
                }
            } else {
                const data = await ordersApi.getOrders({
                    status: statusFilter || undefined,
                    search: searchQuery || undefined,
                });
                shouldApply = latestRequestId.current === requestId;
                if (shouldApply) {
                    setOrders(data);
                }
            }
        } catch (error) {
            shouldApply = latestRequestId.current === requestId;
            if (shouldApply) {
                console.error("Failed to load orders:", error);
            }
        } finally {
            if (shouldApply && latestRequestId.current === requestId) {
                setLoading(false);
                setIsInitialLoad(false);
            }
        }
    };

    const handleStatusChange = (orderId: string, newStatus: OrderStatus, reason?: string) => {
        const currentStatus = orders.find((order) => order.id === orderId)?.status;
        if (!currentStatus) {
            toast.error("Order status is unavailable. Reload the list and try again.");
            return;
        }

        const requireReason = newStatus === OrderStatus.ISSUE;
        if (requireReason && reason === undefined) {
            setTransitioningOrder({ orderId, currentStatus, newStatus, requireReason: true });
        } else {
            performStatusChange(orderId, newStatus, reason);
        }
    };

    const performStatusChange = async (
        orderId: string,
        newStatus: OrderStatus,
        reason?: string
    ) => {
        const currentOrder = orders.find((o) => o.id === orderId);
        try {
            await ordersApi.updateOrderStatus(orderId, {
                status: newStatus,
                reason,
                expected_updated_at: currentOrder?.updated_at,
            });
            setTransitioningOrder(null);
            loadOrders();
        } catch (error: any) {
            console.error("Failed to update status:", error);
            if (error?.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded the latest queue.");
                loadOrders();
                return;
            }
            toast.error("Failed to update order status");
        }
    };

    const handleViewDetail = (orderId?: string) => {
        if (!isValidOrderId(orderId)) {
            toast.error("Order details are unavailable for this row");
            return;
        }
        navigate(`/orders/${orderId}`);
    };

    if (loading && isInitialLoad) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-2">
                    <div className="text-2xl font-semibold text-foreground">Orders</div>
                    <div className="text-sm text-muted-foreground">Loading current workflow queues.</div>
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
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
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
                <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                    <PackageSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-medium text-foreground">No orders to display</p>
                    <p className="text-xs text-muted-foreground">Adjust your filters or clear search to see orders.</p>
                </div>
            )}
            {transitioningOrder && (
                <StatusTransition
                    currentStatus={transitioningOrder.currentStatus}
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
