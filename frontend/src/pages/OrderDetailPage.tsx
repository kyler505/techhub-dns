import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { isAxiosError } from "axios";
import type { StatusFilter } from "../components/Filters";
import { AlertCircle, ArrowLeft, ChevronDown, FileSearch } from "lucide-react";
import { toast } from "sonner";

import { ordersApi } from "../api/orders";
import { settingsApi } from "../api/settings";
import OrdersRail from "../components/OrdersRail";
import { useAuth } from "../contexts/AuthContext";
import OrderDetailComponent from "../components/OrderDetail";
import StatusTransition from "../components/StatusTransition";
import { Button } from "../components/ui/button";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";

import { getOrderAuditQueryOptions, getOrderDetailQueryOptions, getOrdersListQueryOptions, invalidateOrderQueries } from "../queries/orders";
import { OrderStatus } from "../types/order";
import { extractApiErrorMessage, shouldThrowToBoundary } from "../utils/apiErrors";
import { isValidOrderId } from "../utils/orderIds";
import { SkeletonCard } from "../components/Skeleton";

export default function OrderDetailPage() {
    const { orderId: rawOrderId } = useParams<{ orderId: string }>();
    const orderId = isValidOrderId(rawOrderId) ? rawOrderId : null;
    const invalidOrderId = Boolean(rawOrderId) && !orderId;
    const navigate = useNavigate();
    const location = useLocation();
    const locationState = (location.state as {
        statusFilter?: StatusFilter;
        search?: string;
    } | null);
    const [sidebarStatusFilter, setSidebarStatusFilter] = useState<StatusFilter>(
        locationState?.statusFilter ?? [OrderStatus.PICKED, OrderStatus.QA],
    );
    const sidebarSearch = locationState?.search ?? "";
    const { user } = useAuth();
    const [transitioningStatus, setTransitioningStatus] = useState<{
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);
    const queryClient = useQueryClient();
    const [mobileShowOrders, setMobileShowOrders] = useState(false);

    const { orders: websocketOrders } = useOrdersWebSocket();
    const lastWebSocketUpdate = useRef<number>(0);

    const orderQuery = useQuery({
        ...getOrderDetailQueryOptions(orderId ?? ""),
        enabled: Boolean(orderId),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        throwOnError: shouldThrowToBoundary,
    });

    const auditQuery = useQuery({
        ...getOrderAuditQueryOptions(orderId ?? ""),
        enabled: Boolean(orderId),
        refetchOnWindowFocus: false,
        throwOnError: shouldThrowToBoundary,
    });

    const listQuery = useQuery({
        ...getOrdersListQueryOptions({ status: sidebarStatusFilter, search: sidebarSearch }),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    });

    const order = orderQuery.data ?? null;
    const auditLogs = auditQuery.data ?? [];
    const notifications = order?.teams_notifications ?? [];
    const sidebarOrders = listQuery.data ?? [];
    const detailLoading = orderQuery.isPending || auditQuery.isPending;
    const sidebarLoading = listQuery.isPending && sidebarOrders.length === 0;

    const handleBack = () => {
        navigate(-1);
    };

    const renderState = (title: string, description: string, icon: "error" | "missing") => (
        <div className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center px-4">
            <div className="w-full rounded-lg border border-border bg-card p-6 text-center shadow-sm">
                {icon === "error" ? (
                    <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
                ) : (
                    <FileSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                )}
                <h1 className="text-lg font-semibold text-foreground">{title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                <Button type="button" variant="outline" className="mt-4 min-h-11 gap-2 px-4" onClick={handleBack} disabled={detailLoading}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
            </div>
        </div>
    );

    const refreshOrder = async (): Promise<void> => {
        if (!orderId) {
            return;
        }

        await invalidateOrderQueries(queryClient, orderId);
    };

    const getUserName = () => user?.display_name || user?.email || "Unknown User";

    const updateStatusMutation = useMutation({
        mutationFn: ({ newStatus, reason, expectedUpdatedAt }: {
            newStatus: OrderStatus;
            reason?: string;
            expectedUpdatedAt?: string;
        }) => {
            if (!orderId) {
                throw new Error("Order id is required");
            }

            return ordersApi.updateOrderStatus(orderId, {
                status: newStatus,
                reason,
                expected_updated_at: expectedUpdatedAt,
            });
        },
        onSuccess: async () => {
            setTransitioningStatus(null);
            await refreshOrder();
        },
        onError: async (error: unknown) => {
            console.error("Failed to update status:", error);
            if (isAxiosError(error) && error.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded the latest details.");
                await refreshOrder();
                return;
            }

            toast.error("Failed to update order status");
        },
    });

    const tagOrderMutation = useMutation({
        mutationFn: (tagIds: string[]) => {
            if (!orderId || !order) {
                throw new Error("Order is unavailable");
            }

            return ordersApi.tagOrder(orderId, {
                tag_ids: tagIds,
                technician: getUserName(),
                expected_updated_at: order.updated_at,
            });
        },
        onSuccess: async () => {
            await refreshOrder();
        },
        onError: async (error: unknown) => {
            console.error("Failed to tag order:", error);
            if (isAxiosError(error) && error.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded the latest details.");
                await refreshOrder();
                return;
            }

            toast.error("Failed to tag order");
        },
    });

    const generatePicklistMutation = useMutation({
        mutationFn: () => {
            if (!orderId || !order) {
                throw new Error("Order is unavailable");
            }

            return ordersApi.generatePicklist(orderId, {
                generated_by: getUserName(),
                expected_updated_at: order.updated_at,
            });
        },
        onSuccess: async () => {
            await refreshOrder();
        },
        onError: async (error: unknown) => {
            console.error("Failed to generate picklist:", error);
            if (isAxiosError(error) && error.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded the latest details.");
                await refreshOrder();
                return;
            }

            const message = extractApiErrorMessage(error, "Failed to generate picklist");
            toast.error(message);
        },
    });

    const handleRequestTags = async () => {
        if (!order) return;
        const inflowOrderId = order.inflow_order_id;
        if (!inflowOrderId) {
            toast.error("Order is missing an inflow order id");
            return;
        }

        try {
            const result = await settingsApi.uploadCanopyOrders([inflowOrderId]);
            if (!result.success) {
                toast.error(result.error || "Failed to request tags");
                return;
            }
            await refreshOrder();
        } catch (error: unknown) {
            const message = extractApiErrorMessage(error, "Failed to request tags");
            toast.error(message);
        }
    };

    useEffect(() => {
        if (websocketOrders.length > 0 && orderId) {
            const updateTime = Date.now();
            if (lastWebSocketUpdate.current > 0) {
                const orderUpdated = websocketOrders.some((wo) => wo.id === orderId);
                if (orderUpdated) {
                    void refreshOrder();
                }
            }
            lastWebSocketUpdate.current = updateTime;
        }
    }, [orderId, websocketOrders]);

    const handleStatusChange = (newStatus: OrderStatus, reason?: string) => {
        if (!order) return;
        const requireReason = newStatus === OrderStatus.ISSUE;
        if (requireReason && reason === undefined) {
            setTransitioningStatus({ newStatus, requireReason: true });
        } else {
            void performStatusChange(newStatus, reason);
        }
    };

    const performStatusChange = async (newStatus: OrderStatus, reason?: string) => {
        if (!order) return;
        try {
            await updateStatusMutation.mutateAsync({
                newStatus,
                reason,
                expectedUpdatedAt: order.updated_at,
            });
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const handleTagOrder = async (tagIds: string[]) => {
        if (!order) return;
        try {
            await tagOrderMutation.mutateAsync(tagIds);
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const handleGeneratePicklist = async () => {
        if (!order) return;
        try {
            await generatePicklistMutation.mutateAsync();
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const handleSelectOrder = (nextOrderId: string) => {
        navigate(`/orders/${nextOrderId}`, {
            state: locationState ?? undefined,
        });
    };

    if (invalidOrderId) {
        return renderState("Invalid order link", "This order link is malformed or missing a valid order id.", "missing");
    }

    if (!detailLoading && orderQuery.isError) {
        return renderState("Failed to load order details", "Try refreshing the page or return to the orders list and try again.", "error");
    }

    if (!detailLoading && !order) {
        return renderState("Order not found", "The order may have been removed or you may not have access to it.", "missing");
    }

    return (
        <div className="-mx-4 sm:-mx-6 lg:-mx-8 h-full">
            <div className="lg:flex lg:h-full lg:items-stretch lg:overflow-hidden">
                <aside className="hidden lg:block lg:h-full lg:w-80 lg:shrink-0 lg:border-r lg:border-border/60">
                    <OrdersRail
                            orders={sidebarOrders}
                            selectedOrderId={orderId}
                            loading={sidebarLoading}
                            status={sidebarStatusFilter}
                            onStatusChange={setSidebarStatusFilter}
                            onSelectOrder={handleSelectOrder}
                        />
                </aside>

                <div className="min-w-0 flex-1 px-4 sm:px-6 lg:px-8 lg:h-full lg:min-h-0 lg:overflow-y-auto">
                    <div className="lg:hidden space-y-3">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between min-h-11 gap-2 px-4"
                            onClick={() => setMobileShowOrders((prev) => !prev)}
                        >
                            Orders
                            <ChevronDown className={`h-4 w-4 transition-transform ${mobileShowOrders ? "rotate-180" : ""}`} />
                        </Button>
                        {mobileShowOrders && (
                            <div className="mt-3">
                                <OrdersRail
                                    orders={sidebarOrders}
                                    selectedOrderId={orderId}
                                    loading={sidebarLoading}
                                    status={sidebarStatusFilter}
                                    onStatusChange={setSidebarStatusFilter}
                                    onSelectOrder={handleSelectOrder}
                                />
                            </div>
                        )}
                    </div>

                <div className="lg:hidden">
                    <Button type="button" variant="outline" className="min-h-11 gap-2 px-4" onClick={handleBack} disabled={detailLoading}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>
                </div>
                {order ? (
                    <OrderDetailComponent
                        order={order}
                        auditLogs={auditLogs}
                        notifications={notifications}
                        onStatusChange={handleStatusChange}
                        onTagOrder={handleTagOrder}
                        onRequestTags={handleRequestTags}
                        onGeneratePicklist={handleGeneratePicklist}
                        generatingPicklist={generatePicklistMutation.isPending}
                    />
                ) : (
                    <SkeletonCard lines={4} />
                )}
                {order && transitioningStatus && (
                    <StatusTransition
                        currentStatus={order.status}
                        newStatus={transitioningStatus.newStatus}
                        requireReason={transitioningStatus.requireReason}
                        onConfirm={(reason) => performStatusChange(transitioningStatus.newStatus, reason)}
                        onCancel={() => setTransitioningStatus(null)}
                        submitting={updateStatusMutation.isPending}
                    />
                )}
                </div>
            </div>
        </div>
    );
}
