import { useState } from "react";
import { OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";

export function useStatusTransition() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transitionStatus = async (
    orderId: string,
    newStatus: OrderStatus,
    reason?: string,
    expectedUpdatedAt?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      await ordersApi.updateOrderStatus(orderId, {
        status: newStatus,
        reason,
        expected_updated_at: expectedUpdatedAt,
      });
      return true;
    } catch (err) {
      setError(err as Error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { transitionStatus, loading, error };
}
