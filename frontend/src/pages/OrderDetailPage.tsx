import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { isAxiosError } from "axios";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ChevronRight, FileSearch, PackageSearch } from "lucide-react";
import { toast } from "sonner";

import { ordersApi } from "../api/orders";
import { settingsApi } from "../api/settings";
import { useAuth } from "../contexts/AuthContext";
import OrderDetailComponent from "../components/OrderDetail";
import { Skeleton, SkeletonCard } from "../components/Skeleton";
import StatusTransition from "../components/StatusTransition";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";

import { getOrderAuditQueryOptions, getOrderDetailQueryOptions, getOrdersListQueryOptions, invalidateOrderQueries } from "../queries/orders";
import { OrderStatus, OrderStatusDisplayNames } from "../types/order";
import { extractApiErrorMessage, shouldThrowToBoundary } from "../utils/apiErrors";
import { formatDeliveryLocation } from "../utils/location";
import { isValidOrderId } from "../utils/orderIds";

export default function OrderDetailPage() {
    const { orderId: rawOrderId } = useParams<{ orderId: string }>();
    const orderId = isValidOrderId(rawOrderId) ? rawOrderId : null;
    const invalidOrderId = Boolean(rawOrderId) && !orderId;
    const navigate = useNavigate();
    const location = useLocation();
    const fromList = Boolean((location.state as Record<string, unknown>)?.fromList);
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

    const listQuery = useQuery(getOrdersListQueryOptions({ status: null, search: "" }));

    const order = orderQuery.data ?? null;
    const auditLogs = auditQuery.data ?? [];
    const notifications = order?.teams_notifications ?? [];
    const sidebarOrders = listQuery.data ?? [];
    const loading = orderQuery.isPending || auditQuery.isPending;
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
                <Button type="button" variant="ghost" className="mt-4 min-h-11 gap-2 px-4" onClick={() => navigate(-1)} disabled={loading}>
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
        navigate(`/orders/${nextOrderId}`, { state: { fromList: true } });
    };

    if (loading) {
        return (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem] sm:p-6">
                <Skeleton className="h-72 w-full rounded-lg" />
                <SkeletonCard className="lg:sticky lg:top-6" lines={6} />
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
        <div>
            <div className="px-4 sm:px-6 lg:px-8">
                <Button type="button" variant="ghost" className="mb-4 min-h-11 gap-2 px-0" onClick={() => navigate(-1)} disabled={loading}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
            </div>

            <div className="lg:flex lg:items-start">
                <motion.aside
                    className="lg:sticky lg:top-0 lg:shrink-0 lg:w-64 lg:self-start"
                    initial={fromList ? { opacity: 0, x: -20 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                >
                    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-none lg:min-h-[calc(100vh-3.5rem)] lg:border-r-0 lg:rounded-r-none">
                        <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                    <h2 className="text-base font-semibold tracking-tight">Orders</h2>
                                    <p className="text-xs text-muted-foreground">Keep browsing without losing the selected order.</p>
                                </div>
                                <Badge variant="secondary" className="shrink-0">
                                    {sidebarOrders.length}
                                </Badge>
                            </div>
                        </div>
                        <div className="p-0">
                            {sidebarLoading ? (
                                <div className="p-4">
                                    <SkeletonCard header={false} lines={5} />
                                </div>
                            ) : sidebarOrders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                                    <PackageSearch className="mb-3 h-7 w-7 text-muted-foreground/60" />
                                    <p className="text-sm font-medium text-foreground">No orders available</p>
                                </div>
                            ) : (
                                <div className="max-h-[calc(100vh-12rem)] divide-y divide-border/60 overflow-auto">
                                    {sidebarOrders.map((sidebarOrder) => {
                                        const isSelected = sidebarOrder.id === order.id;
                                        return (
                                            <button
                                                key={sidebarOrder.id}
                                                type="button"
                                                onClick={() => handleSelectOrder(sidebarOrder.id)}
                                                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none ${
                                                    isSelected ? "bg-primary/5" : "bg-transparent"
                                                }`}
                                            >
                                                <div
                                                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                                                        isSelected ? "bg-primary" : "bg-muted-foreground/30"
                                                    }`}
                                                />
                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-foreground">{sidebarOrder.inflow_order_id}</p>
                                                            <p className="truncate text-xs text-muted-foreground">{sidebarOrder.recipient_name || "N/A"}</p>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            <Badge variant="secondary" className="capitalize">
                                                                {OrderStatusDisplayNames[sidebarOrder.status] ?? sidebarOrder.status}
                                                            </Badge>
                                                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? "translate-x-0.5 text-foreground" : ""}`} />
                                                        </div>
                                                    </div>
                                                    <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                                        {formatDeliveryLocation(sidebarOrder)}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                    </motion.aside>

                <motion.div
                    className="space-y-4 lg:flex-1 lg:min-w-0 px-4 sm:px-6 lg:px-8"
                    initial={fromList ? { opacity: 0, x: 20 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: fromList ? 0.12 : 0 }}
                >
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

                    <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                        <div className="flex flex-wrap gap-3">
                            <Button variant="outline" onClick={() => void refreshOrder()}>
                                Refresh this order
                            </Button>
                            <Button variant="outline" onClick={() => navigate("/orders")}>Back to list</Button>
                        </div>
                    </section>
                </motion.div>
            </div>

            {transitioningStatus && (
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
