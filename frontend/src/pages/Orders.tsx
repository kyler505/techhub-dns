import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { OrderStatus } from "../types/order";
import OrderTable from "../components/OrderTable";
import OrdersRail from "../components/OrdersRail";
import Filters, { StatusFilter } from "../components/Filters";
import StatusTransition from "../components/StatusTransition";
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
        navigate(`/orders/${orderId}`, {
            state: {
                statusFilter,
                search,
            },
        });
    };

    if (ordersQuery.isError && orders.length === 0) {
        return <div className="p-4">Failed to load orders</div>;
    }

    return (
        <div className="container mx-auto py-6 space-y-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
            </div>

            <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-none">
                <div className="p-5 pb-4 sm:p-6 sm:pb-4">
                    <Filters
                        status={statusFilter}
                        onStatusChange={setStatusFilter}
                        search={search}
                        onSearchChange={setSearch}
                        loading={loading}
                    />
                </div>
                <div className="min-h-[280px] px-5 pb-5 sm:px-6 sm:pb-6">
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
                            <div className="hidden lg:block">
                                <OrdersRail
                                    orders={orders}
                                    selectedOrderId={null}
                                    onSelectOrder={handleViewDetail}
                                    loading={loading && orders.length === 0}
                                />
                            </div>
                            <div className="lg:hidden">
                                <OrderTable
                                    orders={orders}
                                    onStatusChange={handleStatusChange}
                                    onViewDetail={handleViewDetail}
                                    showEmptyState={false}
                                    loading={loading}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </section>
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
