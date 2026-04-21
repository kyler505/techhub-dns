import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { isAxiosError } from "axios";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, FileSearch } from "lucide-react";
import { toast } from "sonner";

import { ordersApi } from "../api/orders";
import { settingsApi } from "../api/settings";
import OrdersRail from "../components/OrdersRail";
import { useAuth } from "../contexts/AuthContext";
import OrderDetailComponent from "../components/OrderDetail";
import { Skeleton, SkeletonCard } from "../components/Skeleton";
import StatusTransition from "../components/StatusTransition";
import { Button } from "../components/ui/button";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";

import { getOrderAuditQueryOptions, getOrderDetailQueryOptions, getOrdersListQueryOptions, invalidateOrderQueries } from "../queries/orders";
import { OrderStatus } from "../types/order";
import { extractApiErrorMessage, shouldThrowToBoundary } from "../utils/apiErrors";
import { isValidOrderId } from "../utils/orderIds";
import { buildOrderDetailNavigationState, resolveOrderDetailNavigationState } from "../utils/orderTransitions";

export default function OrderDetailPage() {
    const { orderId: rawOrderId } = useParams<{ orderId: string }>();
    const orderId = isValidOrderId(rawOrderId) ? rawOrderId : null;
    const invalidOrderId = Boolean(rawOrderId) && !orderId;
    const navigate = useNavigate();
    const location = useLocation();
    const {
        animateFromList,
        originPath,
        sidebarStatus,
        sidebarSearch,
    } = resolveOrderDetailNavigationState(location.state);
    const { user } = useAuth();
    const [transitioningStatus, setTransitioningStatus] = useState<{
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);
    const queryClient = useQueryClient();

    const { orders: websocketOrders } = useOrdersWebSocket();
    const lastWebSocketUpdate = useRef<number>(0);

    const orderQuery = useQuery({
        ...getOrderDetailQueryOptions(orderId ?? ""),
        enabled: Boolean(orderId),
        throwOnError: shouldThrowToBoundary,
    });

    const auditQuery = useQuery({
        ...getOrderAuditQueryOptions(orderId ?? ""),
        enabled: Boolean(orderId),
        throwOnError: shouldThrowToBoundary,
    });

    const listQuery = useQuery(getOrdersListQueryOptions({ status: sidebarStatus, search: sidebarSearch }));

    const order = orderQuery.data ?? null;
    const auditLogs = auditQuery.data ?? [];
    const notifications = order?.teams_notifications ?? [];
    const sidebarOrders = listQuery.data ?? [];
    const detailLoading = orderQuery.isPending || auditQuery.isPending;
    const sidebarLoading = listQuery.isPending && sidebarOrders.length === 0;

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
                <Button type="button" variant="outline" className="mt-4 min-h-11 gap-2 px-4" onClick={handleBackToOrigin} disabled={detailLoading}>
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
            replace: true,
            state: buildOrderDetailNavigationState({
                source: "sidebar",
                fromPath: originPath,
                sidebarStatus,
                sidebarSearch,
            }),
        });
    };

    const handleBackToOrigin = () => {
        navigate(originPath);
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
        <div className="lg:flex lg:h-[calc(100vh-3rem)] lg:items-stretch lg:overflow-hidden">
            <div className="px-4 sm:px-6 lg:hidden lg:px-8">
                <Button type="button" variant="outline" className="mb-4 min-h-11 gap-2" onClick={handleBackToOrigin} disabled={detailLoading}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
            </div>

            <div className="lg:h-full lg:shrink-0 lg:w-64">
                <OrdersRail
                    orders={sidebarOrders}
                    selectedOrderId={orderId}
                    onSelectOrder={handleSelectOrder}
                    loading={sidebarLoading}
                    count={sidebarOrders.length}
                    variant="sidebar"
                />
            </div>

            <div className="lg:flex lg:h-full lg:min-w-0 lg:flex-1 lg:flex-col lg:overflow-hidden px-4 sm:px-6 lg:px-8">
                <section className="hidden lg:flex lg:shrink-0 lg:items-center lg:justify-between lg:gap-3 lg:border-b lg:border-border/60 lg:bg-background lg:py-3">
                    <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={handleBackToOrigin} disabled={detailLoading}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>
                    <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={() => void refreshOrder()} disabled={detailLoading}>
                            Refresh this order
                        </Button>
                    </div>
                </section>

                <motion.div
                    className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pt-4 lg:pb-6"
                    initial={animateFromList ? { opacity: 0, scale: 0.985 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={animateFromList ? { duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: 0.02 } : { duration: 0 }}
                >
                    {detailLoading ? (
                        <>
                            <Skeleton className="h-72 w-full rounded-2xl" />
                            <SkeletonCard lines={6} />
                        </>
                    ) : (
                        <>
                            <OrderDetailComponent
                                order={order!}
                                auditLogs={auditLogs}
                                notifications={notifications}
                                onStatusChange={handleStatusChange}
                                onTagOrder={handleTagOrder}
                                onRequestTags={handleRequestTags}
                                onGeneratePicklist={handleGeneratePicklist}
                                generatingPicklist={generatePicklistMutation.isPending}
                            />

                            <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none lg:hidden">
                                <div className="flex flex-wrap gap-3">
                                    <Button variant="outline" onClick={() => void refreshOrder()}>
                                        Refresh this order
                                    </Button>
                                    <Button variant="outline" onClick={handleBackToOrigin}>
                                        Back
                                    </Button>
                                </div>
                            </section>
                        </>
                    )}
                </motion.div>
            </div>

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
    );
}
