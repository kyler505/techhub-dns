import { useEffect, useRef, useState } from "react";
import { deliveryRunsApi } from "../api/deliveryRuns";

export type DeliveryRun = {
  id: string;
  name: string;
  runner: string;
  vehicle: string;
  status: string;
  start_time: string | null;
  order_ids: string[];
};

export function useDeliveryRuns(wsUrl?: string) {
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch runs via HTTP as fallback
  const fetchRuns = async () => {
    try {
      setError(null);
      setLoading(true);
      // Try to fetch runs via HTTP API as fallback
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
      console.error("Failed to fetch runs via HTTP:", err);
      setError("Failed to load delivery runs");
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial HTTP fetch as fallback
    fetchRuns();

    const url =
      wsUrl ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/delivery-runs/ws`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
      wsRef.current = ws;
    } catch (e) {
      console.debug("WebSocket connection failed (expected if backend not running)", e);
      return;
    }

    ws.onopen = () => {
      console.debug("DeliveryRuns WS connected");
      setError(null);
    };

    ws.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.type === "active_runs") {
          setRuns(payload.data || []);
          setLoading(false);
        }
      } catch (e) {
        console.warn("Failed to parse WS message", e);
      }
    };

    ws.onclose = () => {
      console.debug("DeliveryRuns WS closed");
    };

    ws.onerror = (err) => {
      console.debug("DeliveryRuns WS error (expected if backend not running)", err);
      setError("WebSocket connection failed - using cached data");
    };

    return () => {
      try {
        ws.close();
      } catch (e) {}
    };
  }, [wsUrl]);

  return { runs, loading, error, refetch: fetchRuns };
}
