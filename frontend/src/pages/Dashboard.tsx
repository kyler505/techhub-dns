import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import OrderTable from "../components/OrderTable";
import Filters from "../components/Filters";
import StatusTransition from "../components/StatusTransition";

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [search, setSearch] = useState("");
  const [transitioningOrder, setTransitioningOrder] = useState<{
    orderId: string;
    newStatus: OrderStatus;
    requireReason: boolean;
  } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, [statusFilter, search]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await ordersApi.getOrders({
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setOrders(data);
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setLoading(false);
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
      <h1 className="text-3xl font-bold mb-4">Orders Dashboard</h1>
      <Filters
        status={statusFilter}
        onStatusChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
      />
      <OrderTable
        orders={orders}
        onStatusChange={handleStatusChange}
        onViewDetail={handleViewDetail}
      />
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
