import { useState, useEffect, useRef } from "react";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import { useOrdersWebSocket } from "./useOrdersWebSocket";

export function useOrders(status?: OrderStatus, search?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const wsDataReceived = useRef(false);

  // Use WebSocket for real-time updates
  const { orders: wsOrders, loading: wsLoading, error: wsError } = useOrdersWebSocket();

  // Track when WebSocket data is received
  useEffect(() => {
    if (wsOrders.length > 0) {
      wsDataReceived.current = true;
    }
  }, [wsOrders]);

  // WebSocket-first: Only fetch via HTTP if WebSocket fails or on initial load
  useEffect(() => {
    // If WebSocket has provided data, skip HTTP fetch (filter locally instead)
    if (wsDataReceived.current && wsOrders.length > 0) {
      return;
    }

    // If WebSocket error and no data, fall back to HTTP
    if (wsError && !wsOrders.length) {
      loadOrders();
    }

    // Initial load - wait briefly for WebSocket, then fallback to HTTP
    const timeoutId = setTimeout(() => {
      if (!wsDataReceived.current && !wsError) {
        loadOrders();
      }
    }, 1000); // Give WebSocket 1 second to connect

    return () => clearTimeout(timeoutId);
  }, [wsError, status, search]);

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

  // Update orders from WebSocket data, filtered by current status/search
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

      // Cast to Order[] - WebSocket provides summary data that's compatible
      setOrders(filteredOrders as unknown as Order[]);
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
