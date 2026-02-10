import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { User } from "../../contexts/AuthContext";
import type { Vehicle, VehicleStatusItem } from "../../api/vehicleCheckouts";
import { Badge } from "../ui/badge";

type Props = {
  selectedOrdersCount: number;
  user: User | null;
  statusByVehicle: Record<Vehicle, VehicleStatusItem>;
  statusesLoading: boolean;
  onStartRun: (vehicle: Vehicle) => Promise<void>;
  onRequestCheckout: () => void;
};

function runnerDisplay(user: User | null): string {
  return user?.display_name || user?.email || "you";
}

function checkedOutByCurrentUser(status: VehicleStatusItem, user: User | null): boolean {
  if (!status.checked_out) return false;

  const checkedOutBy = status.checked_out_by;
  if (!checkedOutBy) return false;

  const candidates = [user?.display_name, user?.email].filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim())
  );
  return candidates.some((candidate) => candidate === checkedOutBy);
}

export default function DeliveryPrepCard({
  selectedOrdersCount,
  user,
  statusByVehicle,
  statusesLoading,
  onStartRun,
  onRequestCheckout,
}: Props) {
  const [vehicle, setVehicle] = useState<Vehicle>("van");
  const [isStarting, setIsStarting] = useState(false);

  const status = statusByVehicle[vehicle];
  const runner = useMemo(() => runnerDisplay(user), [user?.display_name, user?.email]);

  const startDisabledReason = useMemo((): string | null => {
    if (selectedOrdersCount === 0) return "Select orders to start a run";
    if (statusesLoading) return "Loading vehicle status";

    if (status.delivery_run_active) return "Vehicle already has an active run";
    if (!status.checked_out) return "Vehicle must be checked out";
    if (!checkedOutByCurrentUser(status, user)) {
      const who = status.checked_out_by;
      return who ? `Checked out by ${who}` : "Checked out by another user";
    }

    return null;
  }, [selectedOrdersCount, status, statusesLoading, user]);

  const canStart = startDisabledReason === null;

  const handleStart = async () => {
    if (!canStart) return;
    setIsStarting(true);
    try {
      await onStartRun(vehicle);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Delivery Prep</CardTitle>
        <div className="text-xs text-muted-foreground">Runner: {runner}</div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <div className="grid gap-1">
            <label htmlFor="delivery-prep-vehicle" className="text-sm font-medium">
              Vehicle
            </label>
            <select
              id="delivery-prep-vehicle"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value as Vehicle)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={isStarting}
            >
              <option value="van">Van</option>
              <option value="golf_cart">Golf Cart</option>
            </select>
          </div>

          <div className="grid gap-1">
            <div className="text-sm font-medium">Checkout</div>
            <div className="flex items-center gap-2">
              {status.delivery_run_active ? (
                <Badge variant="warning">Active Run</Badge>
              ) : status.checked_out ? (
                <Badge variant="secondary">Checked Out</Badge>
              ) : (
                <Badge>Available</Badge>
              )}
              <div className="text-xs text-muted-foreground">
                {statusesLoading
                  ? "Loading..."
                  : status.checked_out
                    ? `by ${status.checked_out_by ?? "Unknown"}`
                    : "Not checked out"}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button
              onClick={handleStart}
              disabled={!canStart || isStarting}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isStarting ? "Starting..." : `Start Run (${selectedOrdersCount})`}
            </Button>
            {startDisabledReason ? (
              <div className="text-xs text-muted-foreground">{startDisabledReason}</div>
            ) : null}
            {!status.checked_out && !statusesLoading ? (
              <Button variant="outline" size="sm" onClick={onRequestCheckout} disabled={isStarting}>
                Check out
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
