import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import { OrderStatus } from "../types/order";
import OrderTable from "../components/OrderTable";
import Filters, { StatusFilter } from "../components/Filters";
import StatusTransition from "../components/StatusTransition";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { SkeletonTable } from "../components/Skeleton";
import { PackageSearch, X } from "lucide-react";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";
import { ordersApi } from "../api/orders";
import {
    getOrderAuditQueryOptions,
    getOrderDetailQueryOptions,
    getOrdersListQueryOptions,
    invalidateOrderQueries,
} from "../queries/orders";
import { toast } from "sonner";
import { isValidOrderId } from "../utils/orderIds";

const PREFETCH_STATUS_FILTERS: StatusFilter[] = [
    null,
    [OrderStatus.PICKED, OrderStatus.QA],
    OrderStatus.PRE_DELIVERY,
    OrderStatus.IN_DELIVERY,
    OrderStatus.SHIPPING,
    OrderStatus.DELIVERED,
    OrderStatus.ISSUE,
];

export default function Orders() {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>([OrderStatus.PICKED, OrderStatus.QA]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [transitioningOrder, setTransitioningOrder] = useState<{
        orderId: string;
        currentStatus: OrderStatus;
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);
    const queryClient = useQueryClient();

    // WebSocket hook for real-time order updates
    const { orders: websocketOrders } = useOrdersWebSocket();
    const lastWebSocketUpdate = useRef<number>(0);
    const hasPrefetchedStatusTabs = useRef(false);

    const ordersQuery = useQuery(
        getOrdersListQueryOptions({
            status: statusFilter,
            search: debouncedSearch,
        })
    );

    const orders = ordersQuery.data ?? [];
    const loading = ordersQuery.isPending || ordersQuery.isFetching;
    const isInitialLoad = ordersQuery.isPending && orders.length === 0;

    const selectedOrderDetailQuery = useQuery({
        ...getOrderDetailQueryOptions(selectedOrderId ?? ""),
        enabled: Boolean(selectedOrderId),
        retry: false,
    });

    const selectedOrderAuditQuery = useQuery({
        ...getOrderAuditQueryOptions(selectedOrderId ?? ""),
        enabled: Boolean(selectedOrderId),
        retry: false,
    });

    const selectedOrder = selectedOrderDetailQuery.data ?? null;
    const selectedOrderAudits = selectedOrderAuditQuery.data ?? [];

    const updateStatusMutation = useMutation({
        mutationFn: ({ orderId, newStatus, reason, expectedUpdatedAt }: {
            orderId: string;
            newStatus: OrderStatus;
            reason?: string;
            expectedUpdatedAt?: string;
        }) =>
            ordersApi.updateOrderStatus(orderId, {
                status: newStatus,
                reason,
                expected_updated_at: expectedUpdatedAt,
            }),
        onSuccess: async (_data, variables) => {
            setTransitioningOrder(null);
            await invalidateOrderQueries(queryClient, variables.orderId);
        },
        onError: async (error: unknown, variables) => {
            console.error("Failed to update status:", error);
            if (isAxiosError(error) && error.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded the latest queue.");
                await invalidateOrderQueries(queryClient, variables.orderId);
                return;
            }

            toast.error("Failed to update order status");
        },
    });

    // Track WebSocket updates and refetch when orders change
    useEffect(() => {
        if (websocketOrders.length > 0) {
            const updateTime = Date.now();
            // Only refetch if this is a new update (not the initial connection)
            if (lastWebSocketUpdate.current > 0) {
                void invalidateOrderQueries(queryClient);
            }
            lastWebSocketUpdate.current = updateTime;
        }
    }, [queryClient, websocketOrders]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [search]);

    useEffect(() => {
        if (hasPrefetchedStatusTabs.current) {
            return;
        }

        if (!ordersQuery.isSuccess) {
            return;
        }

        if (debouncedSearch.trim() !== "") {
            return;
        }

        hasPrefetchedStatusTabs.current = true;

        void Promise.all(
            PREFETCH_STATUS_FILTERS.map((status) =>
                queryClient.prefetchQuery(
                    getOrdersListQueryOptions({
                        status,
                        search: "",
                    })
                )
            )
        );
    }, [debouncedSearch, ordersQuery.isSuccess, queryClient]);

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
            await updateStatusMutation.mutateAsync({
                orderId,
                reason,
                newStatus,
                expectedUpdatedAt: currentOrder?.updated_at,
            });
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const handleViewDetail = (orderId?: string) => {
        if (!isValidOrderId(orderId)) {
            toast.error("Order details are unavailable for this row");
            return;
        }
        setSelectedOrderId(orderId);
    };

    if (ordersQuery.isError && orders.length === 0) {
        return <div className="p-4">Failed to load orders</div>;
    }

    return (
        <div className="container mx-auto py-6 space-y-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-4">
                    <Card>
                        <div className="p-6 pb-4">
                            <Filters
                                status={statusFilter}
                                onStatusChange={setStatusFilter}
                                search={search}
                                onSearchChange={setSearch}
                                loading={loading}
                            />
                        </div>
                        <CardContent className="min-h-[280px]">
                            {loading && isInitialLoad ? (
                                <div className="transition-opacity duration-150 opacity-100">
                                    <SkeletonTable rows={6} columns={5} />
                                </div>
                            ) : !loading && orders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <PackageSearch className="mb-3 h-8 w-8 text-muted-foreground/60" />
                                    <p className="text-sm font-medium text-foreground">No orders to display</p>
                                    <p className="text-xs text-muted-foreground">Adjust your filters or clear search to see orders.</p>
                                </div>
                            ) : (
                                <div className={`transition-opacity duration-150 ${loading ? "opacity-90" : "opacity-100"}`}>
                                    <OrderTable
                                        orders={orders}
                                        onStatusChange={handleStatusChange}
                                        onViewDetail={handleViewDetail}
                                        showEmptyState={false}
                                        loading={loading}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <aside className="lg:sticky lg:top-6">
                    <Card className="h-fit">
                        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                            <div>
                                <CardTitle className="text-lg">Order details</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    {selectedOrderId ? "List stays visible while you inspect the order." : "Select an order to inspect it here."}
                                </p>
                            </div>
                            {selectedOrderId ? (
                                <Button variant="ghost" size="icon" onClick={() => setSelectedOrderId(null)} aria-label="Close order details">
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!selectedOrderId ? (
                                <p className="text-sm text-muted-foreground">Open any order from the list to keep the queue in view while you review details.</p>
                            ) : selectedOrderDetailQuery.isLoading ? (
                                <p className="text-sm text-muted-foreground">Loading order details...</p>
                            ) : selectedOrderDetailQuery.isError || !selectedOrder ? (
                                <p className="text-sm text-destructive">Failed to load order details.</p>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Order</p>
                                                <p className="text-base font-semibold text-foreground">{selectedOrder.inflow_order_id || selectedOrder.id}</p>
                                            </div>
                                            <Badge variant="secondary" className="capitalize">{selectedOrder.status.replace(/-/g, " ")}</Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{selectedOrder.recipient_name || "N/A"}</p>
                                        <p className="text-sm text-muted-foreground">{selectedOrder.delivery_location || "No delivery location recorded"}</p>
                                    </div>

                                    <div className="grid gap-3 text-sm">
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Contact</p>
                                            <p className="text-foreground">{selectedOrder.recipient_contact || "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Deliverer</p>
                                            <p className="text-foreground">{selectedOrder.assigned_deliverer || "Unassigned"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Updated</p>
                                            <p className="text-foreground">{selectedOrder.updated_at}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-foreground">Recent activity</p>
                                            <p className="text-xs text-muted-foreground">{selectedOrderAudits.length} entries</p>
                                        </div>
                                        <div className="space-y-2 max-h-48 overflow-auto pr-1">
                                            {selectedOrderAudits.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">No audit history available.</p>
                                            ) : (
                                                selectedOrderAudits.slice(0, 5).map((audit) => (
                                                    <div key={audit.id} className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                                        <p className="font-medium text-foreground">{audit.to_status}</p>
                                                        <p>{audit.changed_by || "System"}</p>
                                                        <p>{audit.timestamp}</p>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <Button asChild className="w-full">
                                        <Link to={`/orders/${selectedOrder.id}`}>Open full order page</Link>
                                    </Button>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </aside>
            </div>

            {transitioningOrder && (
                <StatusTransition
                    currentStatus={transitioningOrder.currentStatus}
                    newStatus={transitioningOrder.newStatus}
                    requireReason={transitioningOrder.requireReason}
                    onConfirm={(reason) =>
                        performStatusChange(transitioningOrder.orderId, transitioningOrder.newStatus, reason)
                    }
                    onCancel={() => setTransitioningOrder(null)}
                    submitting={updateStatusMutation.isPending}
                />
            )}
        </div>
    );
}
