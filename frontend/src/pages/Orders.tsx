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

export default function Orders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>([OrderStatus.PICKED, OrderStatus.QA]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
    const [bulkStatus, setBulkStatus] = useState<OrderStatus>(OrderStatus.PRE_DELIVERY);
    const [bulkUpdating, setBulkUpdating] = useState(false);
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

    useEffect(() => {
        setSelectedOrderIds((previous) => {
            if (previous.size === 0) {
                return previous;
            }
            const visibleIds = new Set(orders.map((order) => order.id));
            const next = new Set([...previous].filter((id) => visibleIds.has(id)));
            return next.size === previous.size ? previous : next;
        });
    }, [orders]);

    const loadOrders = async () => {
        setLoading(true);
        try {
            const searchQuery = debouncedSearch.trim();

            // Handle array of statuses by fetching each and combining
            if (Array.isArray(statusFilter)) {
                const orderPromises = statusFilter.map(status =>
                    ordersApi.getOrders({
                        status,
                        search: searchQuery || undefined,
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
                    search: searchQuery || undefined,
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
            toast.error("Failed to update order status");
        }
    };

    const handleViewDetail = (orderId: string) => {
        navigate(`/orders/${orderId}`);
    };

    const handleToggleSelectOrder = (orderId: string, checked: boolean) => {
        setSelectedOrderIds((previous) => {
            const next = new Set(previous);
            if (checked) {
                next.add(orderId);
            } else {
                next.delete(orderId);
            }
            return next;
        });
    };

    const handleToggleSelectAllVisible = (checked: boolean) => {
        setSelectedOrderIds((previous) => {
            const next = new Set(previous);
            if (checked) {
                orders.forEach((order) => next.add(order.id));
            } else {
                orders.forEach((order) => next.delete(order.id));
            }
            return next;
        });
    };

    const handleBulkMove = async () => {
        if (selectedOrderIds.size === 0 || bulkUpdating) {
            return;
        }

        setBulkUpdating(true);
        try {
            await ordersApi.bulkUpdateStatus({
                order_ids: Array.from(selectedOrderIds),
                status: bulkStatus,
            });
            toast.success(`Moved ${selectedOrderIds.size} order${selectedOrderIds.size === 1 ? "" : "s"} to ${bulkStatus}`);
            setSelectedOrderIds(new Set());
            loadOrders();
        } catch (error) {
            console.error("Failed to bulk update order status:", error);
            toast.error("Failed to move selected orders");
        } finally {
            setBulkUpdating(false);
        }
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
                        selectedOrderIds={selectedOrderIds}
                        onToggleSelectOrder={handleToggleSelectOrder}
                        onToggleSelectAllVisible={handleToggleSelectAllVisible}
                    />
                </CardContent>
            </Card>
            {selectedOrderIds.size > 0 && (
                <div className="fixed bottom-4 left-1/2 z-40 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border/60 bg-popover shadow-lg backdrop-blur">
                    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm font-medium text-foreground">
                            {selectedOrderIds.size} selected
                        </div>
                        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                            <label htmlFor="bulk-status" className="text-xs text-muted-foreground">
                                Move to
                            </label>
                            <select
                                id="bulk-status"
                                value={bulkStatus}
                                onChange={(e) => setBulkStatus(e.target.value as OrderStatus)}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value={OrderStatus.PRE_DELIVERY}>Pre-Delivery</option>
                                <option value={OrderStatus.IN_DELIVERY}>In Delivery</option>
                                <option value={OrderStatus.SHIPPING}>Shipping</option>
                                <option value={OrderStatus.DELIVERED}>Delivered</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleBulkMove}
                                disabled={bulkUpdating}
                                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {bulkUpdating ? "Moving..." : "Apply"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedOrderIds(new Set())}
                                className="h-9 rounded-md border border-input px-3 text-sm text-foreground hover:bg-muted"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {!loading && orders.length === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                    <PackageSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-medium text-foreground">No orders to display</p>
                    <p className="text-xs text-muted-foreground">Adjust your filters or clear search to see orders.</p>
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
