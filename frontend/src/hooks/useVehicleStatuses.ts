import { useCallback, useEffect, useMemo, useState } from "react";

import {
  vehicleCheckoutsApi,
  type Vehicle,
  type VehicleStatusItem,
} from "../api/vehicleCheckouts";

export type VehicleStatus = VehicleStatusItem;

const VEHICLES: Vehicle[] = ["van", "golf_cart"];

type StatusByVehicle = Record<Vehicle, VehicleStatus>;

function buildStatusByVehicle(statuses: VehicleStatusItem[]): StatusByVehicle {
  const base: StatusByVehicle = {
    van: { vehicle: "van", checked_out: false, delivery_run_active: false, checked_out_by: null },
    golf_cart: {
      vehicle: "golf_cart",
      checked_out: false,
      delivery_run_active: false,
      checked_out_by: null,
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

  const statusByVehicle = useMemo(() => buildStatusByVehicle(statuses), [statuses]);

  return { statuses, statusByVehicle, isLoading, error, refresh };
}
