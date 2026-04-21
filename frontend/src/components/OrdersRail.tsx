import { PackageSearch } from "lucide-react";
import { useCallback, useState } from "react";
import type { Order } from "../types/order";
import StatusBadge from "./StatusBadge";
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
    const [focusedIndex, setFocusedIndex] = useState(0);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (orders.length === 0) return;

            let nextIndex = focusedIndex;
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    nextIndex = Math.min(focusedIndex + 1, orders.length - 1);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    nextIndex = Math.max(focusedIndex - 1, 0);
                    break;
                case "Home":
                    e.preventDefault();
                    nextIndex = 0;
                    break;
                case "End":
                    e.preventDefault();
                    nextIndex = orders.length - 1;
                    break;
                default:
                    return;
            }

            setFocusedIndex(nextIndex);
            // Focus the button after state update
            requestAnimationFrame(() => {
                const container = e.currentTarget as HTMLElement;
                const buttons = container.querySelectorAll<HTMLElement>("[data-order-button]");
                buttons[nextIndex]?.focus();
            });
        },
        [focusedIndex, orders.length],
    );

    if (loading && orders.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-3">
                    <div className="h-5 w-28 rounded bg-muted" />
                </div>
                <div role="status" aria-label="Loading orders" className="space-y-3 p-4">
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
        <div className="bg-card">
            <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground">Orders</h2>
                    <span className="text-xs text-muted-foreground">{orders.length}</span>
                </div>
            </div>

            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto" onKeyDown={handleKeyDown}>
                <div className="divide-y divide-border">
                    {orders.map((order, index) => {
                        const orderId = order.id || order.inflow_order_id || `${order.created_at || "order"}-${index}`;
                        const isSelected = selectedOrderId === orderId;
                        const isFocused = focusedIndex === index;
                        const orderLabel = `Order ${order.inflow_order_id || order.id}, ${order.recipient_name || "N/A"}, ${order.status ?? "Unknown"}`;

                        return (
                            <button
                                key={orderId}
                                type="button"
                                data-order-button
                                tabIndex={isFocused ? 0 : -1}
                                onClick={() => onSelectOrder(orderId)}
                                onFocus={() => setFocusedIndex(index)}
                                aria-current={isSelected ? "page" : undefined}
                                aria-label={orderLabel}
                                className={`block w-full px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isSelected ? "bg-primary/15" : ""}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium text-foreground">
                                        {order.inflow_order_id || order.id}
                                    </span>
                                    <StatusBadge status={order.status} />
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-2">
                                    <span className="truncate text-xs text-muted-foreground">
                                        {order.recipient_name || "—"}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatToCentralTime(order.created_at, "MMM d")}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
