import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Order, OrderStatus } from "../types/order";
import StatusBadge from "./StatusBadge";
import { formatToCentralTime } from "../utils/timezone";
import { formatDeliveryLocation } from "../utils/location";
import { ArrowUpDown, PackageSearch } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";
import { Button } from "./ui/button";

interface OrderTableProps {
    orders: Order[];
    onStatusChange?: (orderId: string, newStatus: OrderStatus, reason?: string) => void;
    onViewDetail: (orderId: string) => void;
    showEmptyState?: boolean;
}

export default function OrderTable({
    orders,
    onViewDetail,
    showEmptyState = true,
}: OrderTableProps) {
    const [sortKey, setSortKey] = useState<"id" | "recipient" | "location" | "date" | "status">("date");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const sortedOrders = useMemo(() => {
        const copy = [...orders];
        copy.sort((a, b) => {
            const direction = sortDir === "asc" ? 1 : -1;
            switch (sortKey) {
                case "id":
                    return direction * (a.inflow_order_id || a.id).localeCompare(b.inflow_order_id || b.id);
                case "recipient":
                    return direction * (a.recipient_name || "").localeCompare(b.recipient_name || "");
                case "location":
                    return direction * formatDeliveryLocation(a).localeCompare(formatDeliveryLocation(b));
                case "status":
                    return direction * a.status.localeCompare(b.status);
                case "date":
                default:
                    return direction * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            }
        });
        return copy;
    }, [orders, sortKey, sortDir]);

    const toggleSort = (key: typeof sortKey) => {
        if (sortKey === key) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
            return;
        }
        setSortKey(key);
        setSortDir("desc");
    };

    const isInteractiveTarget = (target: EventTarget | null, currentTarget: HTMLElement): boolean => {
        const el = target as HTMLElement | null;
        if (!el) return false;
        const hit = el.closest(
            "a,button,input,select,textarea,label,[role='button'],[role='link'],[data-row-click-ignore]",
        );
        return Boolean(hit && hit !== currentTarget);
    };

    const navigateToOrder = (orderId: string) => onViewDetail(orderId);

    const onRowClick = (e: MouseEvent<HTMLTableRowElement>, orderId: string) => {
        if (isInteractiveTarget(e.target, e.currentTarget)) return;
        navigateToOrder(orderId);
    };

    const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, orderId: string) => {
        if (isInteractiveTarget(e.target, e.currentTarget)) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        navigateToOrder(orderId);
    };

    if (orders.length === 0) {
        if (!showEmptyState) {
            return null;
        }
        return (
            <div className="py-12 text-center text-muted-foreground">
                <PackageSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">No orders found</p>
                <p className="text-xs text-muted-foreground/80">Try adjusting your filters or search.</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border bg-card shadow-premium overflow-hidden">
            <Table className="min-w-[720px]">
                <TableHeader className="bg-muted/40">
                    <TableRow>
                        <TableHead>
                            <button
                                type="button"
                                onClick={() => toggleSort("id")}
                                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Order ID
                                <ArrowUpDown className="h-3.5 w-3.5" />
                            </button>
                        </TableHead>
                        <TableHead>
                            <button
                                type="button"
                                onClick={() => toggleSort("recipient")}
                                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Recipient
                                <ArrowUpDown className="h-3.5 w-3.5" />
                            </button>
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                            <button
                                type="button"
                                onClick={() => toggleSort("location")}
                                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Location
                                <ArrowUpDown className="h-3.5 w-3.5" />
                            </button>
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                            <button
                                type="button"
                                onClick={() => toggleSort("date")}
                                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Order Date
                                <ArrowUpDown className="h-3.5 w-3.5" />
                            </button>
                        </TableHead>
                        <TableHead>
                            <button
                                type="button"
                                onClick={() => toggleSort("status")}
                                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Status
                                <ArrowUpDown className="h-3.5 w-3.5" />
                            </button>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedOrders.map((order) => (
                        <TableRow
                            key={order.id}
                            tabIndex={0}
                            role="link"
                            onClick={(e) => onRowClick(e, order.id)}
                            onKeyDown={(e) => onRowKeyDown(e, order.id)}
                            className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                        <TableCell>
                            <Button
                                variant="link"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigateToOrder(order.id);
                                }}
                                className="p-0 h-auto font-normal text-foreground/90 hover:text-foreground"
                            >
                                {order.inflow_order_id}
                            </Button>
                        </TableCell>
                        <TableCell>{order.recipient_name || "N/A"}</TableCell>
                        <TableCell className="hidden lg:table-cell">{formatDeliveryLocation(order)}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                            {formatToCentralTime(order.created_at, "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                            <StatusBadge status={order.status} />
                        </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
