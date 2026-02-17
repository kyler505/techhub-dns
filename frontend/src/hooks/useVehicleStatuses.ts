import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";

import {
  vehicleCheckoutsApi,
  type Vehicle,
  type VehicleStatusItem,
} from "../api/vehicleCheckouts";
import { useAuth } from "../contexts/AuthContext";

export type VehicleStatus = VehicleStatusItem;

const VEHICLES: Vehicle[] = ["van", "golf_cart"];

type StatusByVehicle = Record<Vehicle, VehicleStatus>;
type VehicleStatusUpdatePayload = { vehicles: VehicleStatusItem[] };

function getVehicleLabel(vehicle: Vehicle): string {
  if (vehicle === "van") return "Van";
  return "Golf Cart";
}

function isCheckedOutByCurrentUser(status: VehicleStatusItem, user: ReturnType<typeof useAuth>["user"]): boolean {
  const checkedOutByUserId = status.checked_out_by_user_id;
  if (checkedOutByUserId && user?.id) {
    return checkedOutByUserId === user.id;
  }

  const checkedOutBy = status.checked_out_by;
  if (!checkedOutBy) return false;

  const candidates = [user?.display_name, user?.email].filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim())
  );
  return candidates.some((candidate) => candidate === checkedOutBy);
}

function buildStatusByVehicle(statuses: VehicleStatusItem[]): StatusByVehicle {
  const base: StatusByVehicle = {
    van: {
      vehicle: "van",
      checked_out: false,
      delivery_run_active: false,
      checked_out_by: null,
      checked_out_by_user_id: null,
      checkout_type: null,
      purpose: null,
      checked_out_at: null,
    },
    golf_cart: {
      vehicle: "golf_cart",
      checked_out: false,
      delivery_run_active: false,
      checked_out_by: null,
      checked_out_by_user_id: null,
      checkout_type: null,
      purpose: null,
      checked_out_at: null,
    },
  };

  for (const status of statuses) {
    if (VEHICLES.includes(status.vehicle)) {
      base[status.vehicle] = status;
    }
  }

  return base;
}

export function useVehicleStatuses(): {
  statuses: VehicleStatusItem[];
  statusByVehicle: StatusByVehicle;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<VehicleStatusItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await vehicleCheckoutsApi.getStatuses();
      setStatuses(response.vehicles);
    } catch (e) {
      setError("Failed to load vehicle statuses");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    let socket: Socket;

    try {
      socket = io(baseUrl, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    } catch {
      return;
    }

    socket.on("connect", () => {
      setError(null);
      socket.emit("join", { room: "fleet" });
      void refresh();
    });

    socket.on("vehicle_status_update", (payload: VehicleStatusUpdatePayload) => {
      if (!payload || !Array.isArray(payload.vehicles)) return;

      setStatuses((previousStatuses) => {
        if (previousStatuses.length > 0) {
          const previousByVehicle = buildStatusByVehicle(previousStatuses);

          for (const nextStatus of payload.vehicles) {
            const previousStatus = previousByVehicle[nextStatus.vehicle];
            const transitionedToCheckedOutByAnotherUser =
              !previousStatus.checked_out &&
              nextStatus.checked_out &&
              !isCheckedOutByCurrentUser(nextStatus, user);

            if (!transitionedToCheckedOutByAnotherUser) continue;

            const checkedOutBy = nextStatus.checked_out_by?.trim();
            const vehicleLabel = getVehicleLabel(nextStatus.vehicle);
            const message = checkedOutBy
              ? `${vehicleLabel} was checked out by ${checkedOutBy}.`
              : `${vehicleLabel} was checked out.`;
            toast(message);
          }
        }

        return payload.vehicles;
      });
      setIsLoading(false);
      setError(null);
    });

    socket.on("connect_error", () => {
      setError("Socket.IO connection failed - using cached data");
    });

    return () => {
      socket.disconnect();
    };
  }, [refresh, user]);

  const statusByVehicle = useMemo(() => buildStatusByVehicle(statuses), [statuses]);

  return { statuses, statusByVehicle, isLoading, error, refresh };
}
