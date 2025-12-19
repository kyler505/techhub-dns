import { useState, useEffect } from "react";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";

export function useOrders(status?: OrderStatus, search?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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

  return { orders, loading, error, refetch: loadOrders };
}
