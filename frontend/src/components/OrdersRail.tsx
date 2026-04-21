import { PackageSearch } from "lucide-react";
import type { Order } from "../types/order";
import StatusBadge from "./StatusBadge";
import { formatDeliveryLocation } from "../utils/location";
import { formatToCentralTime } from "../utils/timezone";
import { Skeleton } from "./Skeleton";

interface OrdersRailProps {
    orders: Order[];
    selectedOrderId?: string | null;
    loading?: boolean;
    onSelectOrder: (orderId: string) => void;
}

export default function OrdersRail({
    orders,
    selectedOrderId = null,
    loading = false,
    onSelectOrder,
}: OrdersRailProps) {
    if (loading && orders.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-3">
                    <div className="h-5 w-28 rounded bg-muted" />
                </div>
                <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="space-y-2 rounded-md border border-border/60 p-3">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold text-foreground">Orders</h2>
                </div>
                <div className="flex flex-col items-center justify-center px-4 py-10 text-center text-muted-foreground">
                    <PackageSearch className="mb-3 h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-medium text-foreground">No orders found</p>
                    <p className="text-xs text-muted-foreground">Try adjusting your filters or search.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground">Orders</h2>
                    <span className="text-xs text-muted-foreground">{orders.length} shown</span>
                </div>
            </div>
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
                <div className="divide-y divide-border">
                    {orders.map((order, index) => {
                        const orderId = order.id || order.inflow_order_id || `${order.created_at || "order"}-${index}`;
                        const isSelected = selectedOrderId === orderId;

                        return (
                            <button
                                key={orderId}
                                type="button"
                                onClick={() => onSelectOrder(orderId)}
                                aria-current={isSelected ? "page" : undefined}
                                className={`block w-full px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/50 ${isSelected ? "bg-primary/10 ring-inset ring-1 ring-primary/20" : ""}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex min-h-11 items-center gap-2">
                                            <span className="truncate text-sm font-medium text-foreground">
                                                {order.inflow_order_id || order.id}
                                            </span>
                                        </div>
                                        <p className="break-words text-sm text-muted-foreground">
                                            {order.recipient_name || "N/A"}
                                        </p>
                                    </div>
                                    <StatusBadge status={order.status} />
                                </div>
                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                    <p className="line-clamp-2 break-words text-foreground/90">
                                        {formatDeliveryLocation(order)}
                                    </p>
                                    <p>{formatToCentralTime(order.created_at, "MMM d, yyyy")}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
