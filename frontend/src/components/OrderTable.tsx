import { Order, OrderStatus } from "../types/order";
import StatusBadge from "./StatusBadge";
import { formatToCentralTime } from "../utils/timezone";
import { formatDeliveryLocation } from "../utils/location";
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
}

export default function OrderTable({
    orders,
    onViewDetail,
}: OrderTableProps) {
    if (orders.length === 0) {
        return (
            <div className="py-8 text-center text-muted-foreground">
                No orders found
            </div>
        );
    }

    return (
        <Table className="min-w-[720px]">
            <TableHeader>
                <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="hidden lg:table-cell">Order Date</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {orders.map((order) => (
                    <TableRow key={order.id}>
                        <TableCell>
                            <Button
                                variant="link"
                                onClick={() => onViewDetail(order.id)}
                                className="p-0 h-auto font-normal"
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
    );
}
