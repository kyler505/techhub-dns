import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { OrderSummary } from "../types/websocket";

export function useOrdersWebSocket(socketUrl?: string) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

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

    // Build Socket.IO URL from current host
    const baseUrl = socketUrl || `${window.location.protocol}//${window.location.host}`;

    let socket: Socket;

    try {
      socket = io(baseUrl, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;
    } catch (e) {
      console.debug("Socket.IO connection failed (expected if backend not running)", e);
      return;
    }

    socket.on("connect", () => {
      console.debug("Orders Socket.IO connected");
      setError(null);
      // Join orders namespace/room
      socket.emit("join", { room: "orders" });
    });

    socket.on("orders_update", (payload: { type: string; data: OrderSummary[] }) => {
      try {
        if (payload.type === "orders_update") {
          setOrders(payload.data || []);
          setLoading(false);
        }
      } catch (e) {
        console.warn("Failed to parse Socket.IO message", e);
      }
    });

    socket.on("disconnect", () => {
      console.debug("Orders Socket.IO disconnected");
    });

    socket.on("connect_error", (err) => {
      console.debug("Orders Socket.IO error (expected if backend not running)", err);
      setError("Socket.IO connection failed - using cached data");
    });

    return () => {
      try {
        socket.disconnect();
      } catch (e) {}
    };
  }, [socketUrl]);

  return { orders, loading, error, refetch: fetchOrders };
}
