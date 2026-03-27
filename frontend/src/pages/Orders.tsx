import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { OrderStatus } from "../types/order";
import OrderTable from "../components/OrderTable";
import Filters, { StatusFilter } from "../components/Filters";
import StatusTransition from "../components/StatusTransition";
import { Card, CardContent } from "../components/ui/card";
import { SkeletonTable } from "../components/Skeleton";
import { PackageSearch } from "lucide-react";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";
import { ordersApi } from "../api/orders";
import {
    getOrdersListQueryOptions,
    invalidateOrderQueries,
} from "../queries/orders";
import { toast } from "sonner";
import { isValidOrderId } from "../utils/orderIds";

export default function Orders() {
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
    const queryClient = useQueryClient();

    // WebSocket hook for real-time order updates
    const { orders: websocketOrders } = useOrdersWebSocket();
    const lastWebSocketUpdate = useRef<number>(0);

    const ordersQuery = useQuery(
        getOrdersListQueryOptions({
            status: statusFilter,
            search: debouncedSearch,
        })
    );

    const orders = ordersQuery.data ?? [];
    const loading = ordersQuery.isPending || ordersQuery.isFetching;
    const isInitialLoad = ordersQuery.isPending && orders.length === 0;

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
        onError: async (error: any, variables) => {
            console.error("Failed to update status:", error);
            if (error?.response?.status === 409) {
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
        navigate(`/orders/${orderId}`);
    };

    if (loading && isInitialLoad) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
                </div>
                <Card>
                    <div className="p-6 pb-4">
                        <div className="flex flex-col sm:flex-row gap-4 sm:items-end sm:justify-between">
                            <div className="flex gap-1 -mx-2 px-2">
                                <div className="h-9 w-16 bg-muted rounded-md animate-pulse" />
                                <div className="h-9 w-24 bg-muted rounded-md animate-pulse" />
                                <div className="h-9 w-24 bg-muted rounded-md animate-pulse" />
                                <div className="h-9 w-24 bg-muted rounded-md animate-pulse hidden sm:block" />
                            </div>
                            <div className="h-9 w-full sm:w-[260px] lg:w-[300px] bg-muted rounded-md animate-pulse" />
                        </div>
                    </div>
                    <CardContent className="min-h-[280px]">
                        <SkeletonTable rows={6} columns={5} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (ordersQuery.isError && orders.length === 0) {
        return <div className="p-4">Failed to load orders</div>;
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
                        loading={loading}
                    />
                </div>
                <CardContent className="min-h-[280px]">
                    {!loading && orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <PackageSearch className="mb-3 h-8 w-8 text-muted-foreground/60" />
                            <p className="text-sm font-medium text-foreground">No orders to display</p>
                            <p className="text-xs text-muted-foreground">Adjust your filters or clear search to see orders.</p>
                        </div>
                    ) : (
                        <OrderTable
                            orders={orders}
                            onStatusChange={handleStatusChange}
                            onViewDetail={handleViewDetail}
                            showEmptyState={false}
                            loading={loading}
                        />
                    )}
                </CardContent>
            </Card>
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
