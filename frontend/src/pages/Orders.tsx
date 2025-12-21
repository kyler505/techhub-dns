import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import OrderTable from "../components/OrderTable";
import Filters from "../components/Filters";
import StatusTransition from "../components/StatusTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export default function Orders() {
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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Manage and track your delivery orders
          </p>
        </div>
      </div>

      <Card>
        <div className="p-6 pb-0">
          <Filters
            status={statusFilter}
            onStatusChange={setStatusFilter}
            search={search}
            onSearchChange={setSearch}
          />
        </div>

        <CardHeader>
          <CardDescription>
            {orders.length} order{orders.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrderTable
            orders={orders}
            onStatusChange={handleStatusChange}
            onViewDetail={handleViewDetail}
          />
        </CardContent>
      </Card>
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
