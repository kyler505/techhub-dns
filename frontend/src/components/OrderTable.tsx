import { Order, OrderStatus } from "../types/order";
import StatusBadge from "./StatusBadge";
import { formatToCentralTime } from "../utils/timezone";

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

    if (order.status === OrderStatus.PRE_DELIVERY) {
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

    if (order.status === OrderStatus.IN_DELIVERY) {
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
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2 text-left">Order ID</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Recipient</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Location</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Updated</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Deliverer</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-gray-50">
              <td className="border border-gray-300 px-4 py-2">
                <button
                  onClick={() => onViewDetail(order.id)}
                  className="text-blue-600 hover:underline"
                >
                  {order.inflow_order_id}
                </button>
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {order.recipient_name || "N/A"}
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {order.delivery_location || "N/A"}
              </td>
              <td className="border border-gray-300 px-4 py-2">
                <StatusBadge status={order.status} />
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {formatToCentralTime(order.updated_at)}
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {order.assigned_deliverer || "Unassigned"}
              </td>
              <td className="border border-gray-300 px-4 py-2">
                <div className="flex gap-2 flex-wrap">
                  {getActionButtons(order)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="text-center py-8 text-gray-500">No orders found</div>
      )}
    </div>
  );
}
