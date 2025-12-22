import { useState, useEffect } from "react";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import { useOrdersWebSocket } from "./useOrdersWebSocket";

export function useOrders(status?: OrderStatus, search?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Use WebSocket for real-time updates
  const { orders: wsOrders, loading: wsLoading, error: wsError, refetch: wsRefetch } = useOrdersWebSocket();

  useEffect(() => {
    loadOrders();
  }, [status, search]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ordersApi.getOrders({ status, search });
      setOrders(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  // Update orders from WebSocket data, but filter by current status/search if needed
  useEffect(() => {
    if (wsOrders.length > 0) {
      let filteredOrders = wsOrders;

      // Apply status filter
      if (status) {
        filteredOrders = filteredOrders.filter(order => order.status === status);
      }

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        filteredOrders = filteredOrders.filter(order =>
          order.inflow_order_id?.toLowerCase().includes(searchLower) ||
          order.recipient_name?.toLowerCase().includes(searchLower) ||
          order.delivery_location?.toLowerCase().includes(searchLower)
        );
      }

      setOrders(filteredOrders);
      setLoading(false);
    }
  }, [wsOrders, status, search]);

  // Use WebSocket error if HTTP fallback fails
  useEffect(() => {
    if (wsError && !orders.length) {
      setError(new Error(wsError));
    }
  }, [wsError, orders.length]);

  return {
    orders,
    loading: loading && wsLoading,
    error,
    refetch: loadOrders
  };
}
