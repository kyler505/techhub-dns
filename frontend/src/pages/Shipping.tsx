import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { OrderStatus, ShippingWorkflowStatus } from "../types/order";
import OrderTable from "../components/OrderTable";
import { SkeletonTable } from "../components/Skeleton";
import { PackageSearch, Truck, CheckCircle } from "lucide-react";
import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";
import { ordersApi } from "../api/orders";
import {
    invalidateOrderQueries,
} from "../queries/orders";
import { toast } from "sonner";
import { isValidOrderId } from "../utils/orderIds";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";

export default function Shipping() {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // WebSocket hook for real-time order updates
    const { orders: websocketOrders } = useOrdersWebSocket();
    const lastWebSocketUpdate = useRef<number>(0);

    // Shipment queue: orders with status = SHIPPING
    const shipmentQuery = useQuery({
        queryKey: ["orders", "list", { status: [OrderStatus.SHIPPING], search: debouncedSearch }],
        queryFn: () => ordersApi.getOrders({ status: OrderStatus.SHIPPING, search: debouncedSearch }),
    });

    // Upcoming pickups: orders with status PRE_DELIVERY or IN_DELIVERY
    // Use manual multi-status fetch pattern
    const upcomingQuery = useQuery({
        queryKey: ["orders", "list", "status:[PRE_DELIVERY,IN_DELIVERY]", debouncedSearch],
        queryFn: async () => {
            const results = await Promise.all([
                ordersApi.getOrders({ status: OrderStatus.PRE_DELIVERY, search: debouncedSearch }),
                ordersApi.getOrders({ status: OrderStatus.IN_DELIVERY, search: debouncedSearch }),
            ]);
            // Merge and sort by updated_at desc (same as backend default)
            const merged = [...results[0], ...results[1]];
            merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            return merged;
        },
    });

    const shipmentOrders = shipmentQuery.data ?? [];
    const upcomingOrders = upcomingQuery.data ?? [];
    const loading = shipmentQuery.isPending || shipmentQuery.isFetching || upcomingQuery.isPending;

    // Shipping workflow mutation
    const updateShippingWorkflowMutation = useMutation({
        mutationFn: ({
            orderId,
            status,
            carrierName,
            trackingNumber,
        }: {
            orderId: string;
            status: ShippingWorkflowStatus;
            carrierName?: string;
            trackingNumber?: string;
        }) =>
            ordersApi.updateShippingWorkflow(orderId, {
                status,
                carrier_name: carrierName,
                tracking_number: trackingNumber,
            }),
        onSuccess: async (_data, variables) => {
            await invalidateOrderQueries(queryClient, variables.orderId);
            toast.success("Shipping status updated");
        },
        onError: async (error: unknown, variables) => {
            console.error("Failed to update shipping workflow:", error);
            if (isAxiosError(error) && error.response?.status === 409) {
                toast.error("Order changed by another user. Reloaded.");
                await invalidateOrderQueries(queryClient, variables.orderId);
                return;
            }
            toast.error("Failed to update shipping status");
        },
    });

    // Track WebSocket updates and refetch when orders change
    useEffect(() => {
        if (websocketOrders.length > 0) {
            const updateTime = Date.now();
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
        return () => window.clearTimeout(timeoutId);
    }, [search]);

    const handleAdvanceWorkflow = (orderId: string, currentStatus: ShippingWorkflowStatus | undefined) => {
        let nextStatus: ShippingWorkflowStatus | null = null;
        if (currentStatus === ShippingWorkflowStatus.WORK_AREA) {
            nextStatus = ShippingWorkflowStatus.DOCK;
        } else if (currentStatus === ShippingWorkflowStatus.DOCK) {
            nextStatus = ShippingWorkflowStatus.SHIPPED;
        } else {
            toast.info("Already shipped");
            return;
        }
        if (nextStatus) {
            updateShippingWorkflowMutation.mutate({ orderId, status: nextStatus });
        }
    };

    const handleViewDetail = (orderId?: string) => {
        if (!isValidOrderId(orderId)) {
            toast.error("Order details unavailable");
            return;
        }
        navigate(`/orders/${orderId}`, { state: { fromShipping: true } });
    };

    const renderWorkflowActions = (order: { id: string; shipping_workflow_status?: string }) => {
        const current = order.shipping_workflow_status as ShippingWorkflowStatus | undefined;
        if (current === ShippingWorkflowStatus.WORK_AREA) {
            return (
                <Button
                    size="sm"
                    variant="default"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAdvanceWorkflow(order.id, current);
                    }}
                    disabled={updateShippingWorkflowMutation.isPending}
                >
                    <Truck className="h-3.5 w-3.5 mr-1" />
                    Move to Dock
                </Button>
            );
        }
        if (current === ShippingWorkflowStatus.DOCK) {
            return (
                <Button
                    size="sm"
                    variant="default"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAdvanceWorkflow(order.id, current);
                    }}
                    disabled={updateShippingWorkflowMutation.isPending}
                >
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Mark Shipped
                </Button>
            );
        }
        return <Badge variant="secondary" className="text-xs">Shipped</Badge>;
    };

    if (shipmentQuery.isError && shipmentOrders.length === 0) {
        return <div className="p-4">Failed to load shipment queue</div>;
    }

    return (
        <div className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1600px] space-y-6">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Shipping</h1>
                    <p className="text-sm text-muted-foreground">Track and manage outbound shipments.</p>
                </div>

                {/* Shipment Queue */}
                <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-none">
                    <div className="p-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="flex items-center justify-between border-b border-border/60 pb-4">
                            <div className="space-y-1">
                                <h2 className="text-base font-semibold tracking-tight">Shipment Queue</h2>
                                <p className="text-sm text-muted-foreground">Orders ready to be shipped (outside Bryan/College Station).</p>
                            </div>
                            <Truck className="h-5 w-5 text-muted-foreground/60" />
                        </div>
                    </div>
                    <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                        {/* Simple search */}
                        <div className="mb-4">
                            <Input
                                placeholder="Search by order ID..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="max-w-sm"
                            />
                        </div>
                        {loading && shipmentOrders.length === 0 ? (
                            <div className="transition-opacity duration-150 opacity-100">
                                <SkeletonTable rows={4} columns={5} />
                            </div>
                        ) : shipmentOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <PackageSearch className="mb-3 h-8 w-8 text-muted-foreground/60" />
                                <p className="text-sm font-medium text-foreground">No shipments in the queue</p>
                                <p className="text-xs text-muted-foreground">Orders with status &quot;Shipping&quot; will appear here.</p>
                            </div>
                        ) : (
                            <div className={`transition-opacity duration-150 ${loading ? "opacity-90" : "opacity-100"}`}>
                                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-none" style={{ scrollbarGutter: "stable" }}>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[960px] w-full text-sm">
                                            <thead className="sticky top-0 z-20 bg-muted/40">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Order ID</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Recipient</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Location</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Shipping Workflow</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {shipmentOrders.map((order) => (
                                                    <tr
                                                        key={order.id}
                                                        onClick={() => handleViewDetail(order.id)}
                                                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                                                    >
                                                        <td className="px-4 py-3 break-words">{order.inflow_order_id}</td>
                                                        <td className="px-4 py-3 break-words">{order.recipient_name || "N/A"}</td>
                                                        <td className="px-4 py-3 break-words">{order.delivery_location || "N/A"}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <Badge variant="outline">
                                                                {order.shipping_workflow_status
                                                                    ? order.shipping_workflow_status.replace("_", " ")
                                                                    : "Work Area"}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            {renderWorkflowActions(order)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* Upcoming Pickups */}
                <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-none">
                    <div className="p-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="flex items-center justify-between border-b border-border/60 pb-4">
                            <div className="space-y-1">
                                <h2 className="text-base font-semibold tracking-tight">Upcoming Pickups</h2>
                                <p className="text-sm text-muted-foreground">Orders scheduled for delivery (pre-delivery & in-transit).</p>
                            </div>
                            <PackageSearch className="h-5 w-5 text-muted-foreground/60" />
                        </div>
                    </div>
                    <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                        {loading && upcomingOrders.length === 0 ? (
                            <div className="transition-opacity duration-150 opacity-100">
                                <SkeletonTable rows={3} columns={5} />
                            </div>
                        ) : upcomingOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <PackageSearch className="mb-3 h-8 w-8 text-muted-foreground/60" />
                                <p className="text-sm font-medium text-foreground">No pickups scheduled</p>
                                <p className="text-xs text-muted-foreground">Orders assigned to delivery runs will appear here.</p>
                            </div>
                        ) : (
                            <OrderTable
                                orders={upcomingOrders}
                                onViewDetail={handleViewDetail}
                                showEmptyState={false}
                                loading={loading}
                            />
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
