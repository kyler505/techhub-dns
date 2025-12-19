import { useEffect, useRef, useState } from "react";

export type DeliveryRun = {
  id: string;
  runner: string;
  vehicle: string;
  status: string;
  start_time: string | null;
  order_ids: string[];
};

export function useDeliveryRuns(wsUrl?: string) {
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url =
      wsUrl ||
      `${window.location.origin.replace(/^http/, "ws")}/api/delivery-runs/ws`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
      wsRef.current = ws;
    } catch (e) {
      console.warn("WebSocket connection failed", e);
      return;
    }

    ws.onopen = () => {
      console.debug("DeliveryRuns WS connected");
    };

    ws.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.type === "active_runs") {
          setRuns(payload.data || []);
        }
      } catch (e) {
        console.warn("Failed to parse WS message", e);
      }
    };

    ws.onclose = () => {
      console.debug("DeliveryRuns WS closed");
    };

    ws.onerror = (err) => {
      console.warn("DeliveryRuns WS error", err);
    };

    return () => {
      try {
        ws.close();
      } catch (e) {}
    };
  }, [wsUrl]);

  return { runs };
}
