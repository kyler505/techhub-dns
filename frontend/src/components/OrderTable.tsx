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
  onStatusChange: (orderId: string, newStatus: OrderStatus, reason?: string) => void;
  onViewDetail: (orderId: string) => void;
}

export default function OrderTable({
  orders,
  onStatusChange,
  onViewDetail,
}: OrderTableProps) {
  const getActionButtons = (order: Order) => {
    const buttons = [];

    if (order.status === OrderStatus.PRE_DELIVERY && order.delivery_run_id) {
      buttons.push(
        <button
          key="start-delivery"
          onClick={() => onStatusChange(order.id, OrderStatus.IN_DELIVERY)}
          className="px-2 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
        >
          Start Delivery
        </button>
      );
    }

    if (order.status === OrderStatus.PRE_DELIVERY && !order.delivery_run_id) {
      buttons.push(
        <button
          key="start-shipping"
          onClick={() => onStatusChange(order.id, OrderStatus.SHIPPING)}
          className="px-2 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          Start Shipping
        </button>
      );
    }

    if (order.status === OrderStatus.IN_DELIVERY || order.status === OrderStatus.SHIPPING) {
      buttons.push(
        <button
          key="delivered"
          onClick={() => onStatusChange(order.id, OrderStatus.DELIVERED)}
          className="px-2 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
        >
          Mark Delivered
        </button>
      );
    }

    if (order.status !== OrderStatus.ISSUE && order.status !== OrderStatus.DELIVERED) {
      buttons.push(
        <button
          key="issue"
          onClick={() => onStatusChange(order.id, OrderStatus.ISSUE, "")}
          className="px-2 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
        >
          Flag Issue
        </button>
      );
    }

    return buttons;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order ID</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Order Date</TableHead>
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
            <TableCell>{formatDeliveryLocation(order)}</TableCell>
            <TableCell>
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
