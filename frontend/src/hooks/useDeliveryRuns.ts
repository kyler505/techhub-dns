import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";

import { deliveryRunsQueryKeys, getActiveDeliveryRunsQueryOptions, type ActiveDeliveryRun } from "../queries/deliveryRuns";

export type DeliveryRun = ActiveDeliveryRun;

export function useDeliveryRuns(socketUrl?: string) {
  const [socketError, setSocketError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery(getActiveDeliveryRunsQueryOptions());

  const runs = query.data ?? [];
  const loading = query.isPending && runs.length === 0;
  const error = query.isError ? "Failed to load delivery runs" : socketError;

  useEffect(() => {
    // Build Socket.IO URL from current host
    const baseUrl = socketUrl || `${window.location.protocol}//${window.location.host}`;

    let socket: Socket | null = null;

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
    }

    if (!socket) {
      return () => {
        const currentSocket = socketRef.current;
        if (currentSocket) {
          currentSocket.disconnect();
          socketRef.current = null;
        }
      };
    }

    socket.on("connect", () => {
      console.debug("DeliveryRuns Socket.IO connected");
      setSocketError(null);
      // Join delivery-runs namespace/room
      socket.emit("join", { room: "delivery-runs" });
    });

    socket.on("active_runs", (payload: { type: string; data: DeliveryRun[] }) => {
      try {
        if (payload.type === "active_runs") {
          queryClient.setQueryData(deliveryRunsQueryKeys.active(), payload.data || []);
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
      setSocketError("Socket.IO connection failed - using cached data");
    });

    return () => {
      const currentSocket = socketRef.current;
      if (currentSocket) {
        currentSocket.disconnect();
        socketRef.current = null;
        }
      };
  }, [queryClient, socketUrl]);

  return {
    runs,
    loading,
    error,
    refetch: async () => {
      await query.refetch();
    },
  };
}
