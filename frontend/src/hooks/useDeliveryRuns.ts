import { useEffect, useRef, useState } from "react";
import { deliveryRunsApi } from "../api/deliveryRuns";
import { DeliveryRun, WebSocketMessage } from "../types/websocket";

export function useDeliveryRuns(wsUrl?: string) {
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const connectWebSocket = () => {
    // Don't create a new WebSocket if we already have one or are connecting
    if (wsRef.current || isConnectingRef.current) {
      return;
    }

    const url =
      wsUrl ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/delivery-runs/ws`;

    isConnectingRef.current = true;



    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
      wsRef.current = ws;
      isConnectingRef.current = false;

      ws.onopen = () => {

        console.debug("DeliveryRuns WS connected");
        setError(null);
      };

      ws.onmessage = (evt) => {

        try {
          const payload: WebSocketMessage = JSON.parse(evt.data);
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
        wsRef.current = null;
        isConnectingRef.current = false;
      };

      ws.onerror = (err) => {

        console.debug("DeliveryRuns WS error (expected if backend not running)", err);
        setError("WebSocket connection failed - using cached data");
        wsRef.current = null;
        isConnectingRef.current = false;
      };

    } catch (e) {
      isConnectingRef.current = false;


      console.debug("WebSocket connection failed (expected if backend not running)", e);
      return;
    } finally {
      // Ensure connecting flag is reset
    }
  };

  // Cleanup WebSocket when wsUrl changes or component unmounts
  useEffect(() => {
    return () => {

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
      isConnectingRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [wsUrl]);

  // Initial setup
  useEffect(() => {
    // Initial HTTP fetch as fallback
    fetchRuns();

    // Connect WebSocket
    connectWebSocket();
  }, []); // Empty dependency array - only run once on mount

  return { runs, loading, error, refetch: fetchRuns };
}
