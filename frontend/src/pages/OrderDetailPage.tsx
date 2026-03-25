import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, FileSearch } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { ordersApi } from "../api/orders";
import { settingsApi } from "../api/settings";
import OrderDetailComponent from "../components/OrderDetail";
import { Skeleton } from "../components/Skeleton";
import StatusTransition from "../components/StatusTransition";
import { Button } from "../components/ui/button";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";
import {
    getOrderAuditQueryOptions,
    getOrderDetailQueryOptions,
    invalidateOrderQueries,
} from "../queries/orders";
import { OrderStatus } from "../types/order";
import { extractApiErrorMessage, shouldThrowToBoundary } from "../utils/apiErrors";
import { isValidOrderId } from "../utils/orderIds";

export default function OrderDetailPage() {
    const { orderId: rawOrderId } = useParams<{ orderId: string }>();
    const orderId = isValidOrderId(rawOrderId) ? rawOrderId : null;
    const invalidOrderId = Boolean(rawOrderId) && !orderId;
    const navigate = useNavigate();
    const { user } = useAuth();
    const [transitioningStatus, setTransitioningStatus] = useState<{
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);
    const queryClient = useQueryClient();

    // WebSocket hook for real-time order updates
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

    const order = orderQuery.data ?? null;
    const auditLogs = auditQuery.data ?? [];
    const notifications = order?.teams_notifications ?? [];
    const loading = orderQuery.isPending || auditQuery.isPending;

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
                <Button type="button" variant="ghost" className="mt-4 gap-2" onClick={() => navigate(-1)} disabled={loading}>
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
        onError: async (error: any) => {
            console.error("Failed to update status:", error);
            if (error?.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded the latest details.");
                await refreshOrder();
                return;
            }

            toast.error("Failed to update order status");
        },
    });

    const retryNotificationMutation = useMutation({
        mutationFn: () => {
            if (!orderId) {
                throw new Error("Order id is required");
            }

            return ordersApi.retryNotification(orderId);
        },
        onSuccess: async () => {
            await refreshOrder();
        },
        onError: (error) => {
            console.error("Failed to retry notification:", error);
            toast.error("Failed to retry notification");
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
        onError: async (error: any) => {
            console.error("Failed to tag order:", error);
            if (error?.response?.status === 409) {
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
        onError: async (error: any) => {
            console.error("Failed to generate picklist:", error);
            if (error?.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded the latest details.");
                await refreshOrder();
                return;
            }

            const message = extractApiErrorMessage(error, "Failed to generate picklist");
            toast.error(message);
        },
    });

    // Track WebSocket updates and refetch if this order might have changed
    useEffect(() => {
        if (websocketOrders.length > 0 && orderId) {
            const updateTime = Date.now();
            // Only refetch if this is a new update (not the initial connection)
            // and the current order is in the updated list
            if (lastWebSocketUpdate.current > 0) {
                const orderUpdated = websocketOrders.some(wo => wo.id === orderId);
                if (orderUpdated) {
                    void refreshOrder();
                }
            }
            lastWebSocketUpdate.current = updateTime;
        }
    }, [orderId, websocketOrders]);

    useEffect(() => {
        if (invalidOrderId) {
            return;
        }
    }, [invalidOrderId]);

    const handleStatusChange = (newStatus: OrderStatus, reason?: string) => {
        if (!order) return;
        const requireReason = newStatus === OrderStatus.ISSUE;
        if (requireReason && reason === undefined) {
            setTransitioningStatus({ newStatus, requireReason: true });
        } else {
            performStatusChange(newStatus, reason);
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

    const handleRetryNotification = async () => {
        if (!order) return;
        try {
            await retryNotificationMutation.mutateAsync();
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const getUserName = () => user?.display_name || user?.email || "Unknown User";

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
        } catch (error: any) {
            const message = extractApiErrorMessage(error, "Failed to request tags");
            toast.error(message);
        }
    };


    if (loading) {
        return (
            <div className="space-y-4 p-4">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-72 w-full rounded-lg" />
            </div>
        );
    }

    if (invalidOrderId) {
        return renderState("Invalid order link", "This order link is malformed or missing a valid order id.", "missing");
    }

    if (orderQuery.isError) {
        return renderState("Failed to load order details", "Try refreshing the page or return to the orders list and try again.", "error");
    }

    if (!order) {
        return renderState("Order not found", "The order may have been removed or you may not have access to it.", "missing");
    }

    return (
        <div className="p-4">
            <Button type="button" variant="ghost" className="mb-4 gap-2" onClick={() => navigate(-1)} disabled={loading}>
                <ArrowLeft className="h-4 w-4" />
                Back
            </Button>
            <OrderDetailComponent
                order={order}
                auditLogs={auditLogs}
                notifications={notifications}
                onStatusChange={handleStatusChange}
                onRetryNotification={handleRetryNotification}
                onTagOrder={handleTagOrder}
                onRequestTags={handleRequestTags}
                onGeneratePicklist={handleGeneratePicklist}
                generatingPicklist={generatePicklistMutation.isPending}
                retryingNotification={retryNotificationMutation.isPending}
            />
            {transitioningStatus && (
                <StatusTransition
                    currentStatus={order.status}
                    newStatus={transitioningStatus.newStatus}
                    requireReason={transitioningStatus.requireReason}
                    onConfirm={(reason) =>
                        performStatusChange(transitioningStatus.newStatus, reason)
                    }
                    onCancel={() => setTransitioningStatus(null)}
                    submitting={updateStatusMutation.isPending}
                />
            )}
        </div>
    );
}
