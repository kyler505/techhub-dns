import { motion } from "framer-motion";
import { ChevronRight, PackageSearch } from "lucide-react";

import type { Order, OrderStatus } from "../types/order";
import { OrderStatusDisplayNames } from "../types/order";
import { formatDeliveryLocation } from "../utils/location";
import { SkeletonCard } from "./Skeleton";
import { Badge } from "./ui/badge";

type OrdersRailProps = {
    orders: Order[];
    selectedOrderId?: string | null;
    onSelectOrder: (orderId: string) => void;
    loading?: boolean;
    count?: number;
    variant: "full" | "sidebar";
};

const shellLayoutId = "orders-shell";
const titleLayoutId = "orders-shell-title";
const subtitleLayoutId = "orders-shell-subtitle";
const countLayoutId = "orders-shell-count";
const rowLayoutId = (orderId: string) => `orders-row-${orderId}`;
const shellLayoutTransition = {
    duration: 0.38,
    ease: [0.22, 1, 0.36, 1] as const,
};
const selectedRowTransition = {
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as const,
};

export default function OrdersRail({
    orders,
    selectedOrderId = null,
    onSelectOrder,
    loading = false,
    count,
    variant,
}: OrdersRailProps) {
    const isSidebar = variant === "sidebar";

    return (
        <motion.section
            layoutId={shellLayoutId}
            initial={false}
            transition={{ layout: shellLayoutTransition }}
            className={[
                "overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-none",
                isSidebar ? "lg:flex lg:h-full lg:flex-col lg:border-r-0 lg:rounded-r-none" : "",
            ].join(" ")}
        >
            <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <motion.h2 layoutId={titleLayoutId} initial={false} className="text-base font-semibold tracking-tight">
                            Orders
                        </motion.h2>
                        <motion.p layoutId={subtitleLayoutId} initial={false} className="text-xs text-muted-foreground">
                            Keep browsing without losing the selected order.
                        </motion.p>
                    </div>
                    <motion.div layoutId={countLayoutId} initial={false}>
                        <Badge variant="secondary" className="shrink-0">
                            {count ?? orders.length}
                        </Badge>
                    </motion.div>
                </div>
            </div>

            <div className={isSidebar ? "p-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : "p-0"}>
                {loading ? (
                    <div className="p-4">
                        <SkeletonCard header={false} lines={isSidebar ? 5 : 8} />
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                        <PackageSearch className="mb-3 h-7 w-7 text-muted-foreground/60" />
                        <p className="text-sm font-medium text-foreground">No orders available</p>
                    </div>
                ) : (
                    <div
                        className={[
                            "divide-y divide-border/60 overflow-auto",
                            isSidebar ? "max-h-[calc(100vh-12rem)] lg:min-h-0 lg:flex-1 lg:max-h-none" : "max-h-[70vh]",
                        ].join(" ")}
                    >
                        {orders.map((order) => {
                            const isSelected = order.id === selectedOrderId;
                            const rowContent = (
                                <>
                                    <div
                                        className={[
                                            "mt-1 shrink-0 rounded-full",
                                            isSidebar ? "h-2.5 w-2.5" : "h-3 w-3",
                                            isSelected ? "bg-primary" : "bg-muted-foreground/30",
                                        ].join(" ")}
                                    />

                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className={[
                                                    "truncate font-semibold text-foreground",
                                                    isSidebar ? "text-sm" : "text-base",
                                                ].join(" ")}>
                                                    {order.inflow_order_id}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                                                    {order.recipient_name || "N/A"}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 items-center gap-2">
                                                <Badge variant="secondary" className="capitalize">
                                                    {OrderStatusDisplayNames[order.status as OrderStatus] ?? order.status}
                                                </Badge>
                                                <ChevronRight
                                                    className={[
                                                        "h-4 w-4 text-muted-foreground transition-transform",
                                                        isSelected ? "translate-x-0.5 text-foreground" : "",
                                                    ].join(" ")}
                                                />
                                            </div>
                                        </div>

                                        <p className={[
                                            "text-muted-foreground",
                                            isSidebar ? "line-clamp-2 text-xs leading-5" : "line-clamp-1 text-sm leading-5",
                                        ].join(" ")}>
                                            {formatDeliveryLocation(order)}
                                        </p>
                                    </div>
                                </>
                            );

                            const sharedClassName = [
                                "flex w-full items-start gap-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
                                isSidebar ? "px-4 py-3" : "px-5 py-4 sm:px-6",
                                isSelected ? "bg-primary/5" : "bg-transparent",
                            ].join(" ");

                            if (isSelected) {
                                return (
                                    <motion.button
                                        key={order.id}
                                        type="button"
                                        onClick={() => onSelectOrder(order.id)}
                                        layoutId={rowLayoutId(order.id)}
                                        initial={false}
                                        transition={{ layout: selectedRowTransition }}
                                        className={sharedClassName}
                                    >
                                        {rowContent}
                                    </motion.button>
                                );
                            }

                            return (
                                <button
                                    key={order.id}
                                    type="button"
                                    onClick={() => onSelectOrder(order.id)}
                                    className={sharedClassName}
                                >
                                    {rowContent}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.section>
    );
}
