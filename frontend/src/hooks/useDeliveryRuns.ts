import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export type DeliveryRun = {
  id: string;
  name?: string;
  runner: string;
  vehicle: string;
  status: string;
  start_time: string | null;
  order_ids: string[];
};

export function useDeliveryRuns(socketUrl?: string) {
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Fetch delivery runs via HTTP as fallback
  const fetchRuns = async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await fetch('/api/delivery-runs/active');
      if (response.ok) {
        const data = await response.json();
        setRuns(data);
      } else {
        console.warn("HTTP fallback failed:", response.status);
        setRuns([]);
      }
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch delivery runs via HTTP:", err);
      setError("Failed to load delivery runs");
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial HTTP fetch as fallback
    fetchRuns();

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
      console.debug("DeliveryRuns Socket.IO connected");
      setError(null);
      // Join delivery-runs namespace/room
      socket.emit("join", { room: "delivery-runs" });
    });

    socket.on("active_runs", (payload: { type: string; data: DeliveryRun[] }) => {
      try {
        if (payload.type === "active_runs") {
          setRuns(payload.data || []);
          setLoading(false);
        }
      } catch (e) {
        console.warn("Failed to parse Socket.IO message", e);
      }
    });

    socket.on("disconnect", () => {
      console.debug("DeliveryRuns Socket.IO disconnected");
    });

    socket.on("connect_error", (err) => {
      console.debug("DeliveryRuns Socket.IO error (expected if backend not running)", err);
      setError("Socket.IO connection failed - using cached data");
    });

    return () => {
      try {
        socket.disconnect();
      } catch (e) {}
    };
  }, [socketUrl]);

  return { runs, loading, error, refetch: fetchRuns };
}
