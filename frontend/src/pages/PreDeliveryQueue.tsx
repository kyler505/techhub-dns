import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import StatusTransition from "../components/StatusTransition";

export default function PreDeliveryQueue() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [transitioningOrder, setTransitioningOrder] = useState<{
    orderId: string;
    newStatus: OrderStatus;
    requireReason: boolean;
  } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await ordersApi.getOrders({ status: OrderStatus.PRE_DELIVERY });
      setOrders(data);
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleBulkStartDelivery = async () => {
    if (selectedOrders.size === 0) {
      alert("Please select at least one order");
      return;
    }
    try {
      await ordersApi.bulkUpdateStatus({
        order_ids: Array.from(selectedOrders),
        status: OrderStatus.IN_DELIVERY,
      });
      setSelectedOrders(new Set());
      loadOrders();
    } catch (error) {
      console.error("Failed to start delivery:", error);
      alert("Failed to start delivery");
    }
  };

  const handleStatusChange = (orderId: string, newStatus: OrderStatus, reason?: string) => {
    const requireReason = newStatus === OrderStatus.ISSUE;
    if (requireReason && reason === undefined) {
      setTransitioningOrder({ orderId, newStatus, requireReason: true });
    } else {
      performStatusChange(orderId, newStatus, reason);
    }
  };

  const performStatusChange = async (
    orderId: string,
    newStatus: OrderStatus,
    reason?: string
  ) => {
    try {
      await ordersApi.updateOrderStatus(orderId, { status: newStatus, reason });
      setTransitioningOrder(null);
      loadOrders();
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update order status");
    }
  };

  const handleViewDetail = (orderId: string) => {
    navigate(`/orders/${orderId}`);
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Pre-Delivery Queue</h1>
      <div className="mb-4 flex gap-2">
        <button
          onClick={handleBulkStartDelivery}
          disabled={selectedOrders.size === 0}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300"
        >
          Start Delivery ({selectedOrders.size} selected)
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2">
                <input
                  type="checkbox"
                  checked={selectedOrders.size === orders.length && orders.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedOrders(new Set(orders.map((o) => o.id)));
                    } else {
                      setSelectedOrders(new Set());
                    }
                  }}
                />
              </th>
              <th className="border border-gray-300 px-4 py-2 text-left">Order ID</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Recipient</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Location</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Deliverer</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedOrders.has(order.id)}
                    onChange={() => handleSelectOrder(order.id)}
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2">
                  <button
                    onClick={() => handleViewDetail(order.id)}
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
                  {order.assigned_deliverer || "Unassigned"}
                </td>
                <td className="border border-gray-300 px-4 py-2">
                  <button
                    onClick={() => handleStatusChange(order.id, OrderStatus.ISSUE, "")}
                    className="px-2 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Flag Issue
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {transitioningOrder && (
        <StatusTransition
          currentStatus={
            orders.find((o) => o.id === transitioningOrder.orderId)?.status || OrderStatus.PRE_DELIVERY
          }
          newStatus={transitioningOrder.newStatus}
          requireReason={transitioningOrder.requireReason}
          onConfirm={(reason) =>
            performStatusChange(transitioningOrder.orderId, transitioningOrder.newStatus, reason)
          }
          onCancel={() => setTransitioningOrder(null)}
        />
      )}
    </div>
  );
}
