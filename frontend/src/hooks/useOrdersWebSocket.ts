import { useEffect, useRef, useState } from "react";
import { Order } from "../types/order";
import { WebSocketMessage, OrderSummary } from "../types/websocket";

export function useOrdersWebSocket(wsUrl?: string) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch orders via HTTP as fallback
  const fetchOrders = async () => {
    try {
      setError(null);
      setLoading(true);
      // Try to fetch orders via HTTP API as fallback
      const response = await fetch('/api/orders');
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        console.warn("HTTP fallback failed:", response.status);
        setOrders([]);
      }
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch orders via HTTP:", err);
      setError("Failed to load orders");
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial HTTP fetch as fallback
    fetchOrders();

    const url =
      wsUrl ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/orders/ws`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
      wsRef.current = ws;
    } catch (e) {
      console.debug("WebSocket connection failed (expected if backend not running)", e);
      return;
    }

    ws.onopen = () => {
      console.debug("Orders WS connected");
      setError(null);
    };

    ws.onmessage = (evt) => {
      try {
        const payload: WebSocketMessage = JSON.parse(evt.data);
        if (payload.type === "orders_update") {
          setOrders(payload.data || []);
          setLoading(false);
        }
      } catch (e) {
        console.warn("Failed to parse WS message", e);
      }
    };

    ws.onclose = () => {
      console.debug("Orders WS closed");
    };

    ws.onerror = (err) => {
      console.debug("Orders WS error (expected if backend not running)", err);
      setError("WebSocket connection failed - using cached data");
    };

    return () => {
      try {
        ws.close();
      } catch (e) {}
    };
  }, [wsUrl]);

  return { orders, loading, error, refetch: fetchOrders };
}
