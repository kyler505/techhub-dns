import { useMemo, useState } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";
import type { VehicleStatusItem } from "../api/vehicleCheckouts";
import { useAuth } from "../contexts/AuthContext";

interface CreateDeliveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateDelivery: (vehicle: string) => Promise<void>;
  selectedOrdersCount: number;
  vehicleStatuses?: VehicleStatusItem[];
}

export default function CreateDeliveryDialog({
  isOpen,
  onClose,
  onCreateDelivery,
  selectedOrdersCount,
  vehicleStatuses,
}: CreateDeliveryDialogProps) {
  const { user } = useAuth();

  const [vehicle, setVehicle] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const runnerDisplay = useMemo(() => {
    return user?.display_name || user?.email || "you";
  }, [user?.display_name, user?.email]);

  const selectedVehicleStatus = vehicleStatuses?.find((s) => s.vehicle === vehicle);
  const requiresCheckout = Boolean(vehicleStatuses);
  const vehicleCheckedOut = Boolean(selectedVehicleStatus?.checked_out);
  const vehicleDeliveryRunActive = Boolean(selectedVehicleStatus?.delivery_run_active);
  const vehicleCheckedOutBy = selectedVehicleStatus?.checked_out_by || null;
  const vehicleCheckedOutBySomeoneElse = Boolean(
    requiresCheckout && vehicleCheckedOutBy && vehicleCheckedOutBy !== runnerDisplay
  );

  const applyVehicleSelection = (nextVehicle: string) => {
    setVehicle(nextVehicle);
  };

  const getApiErrorMessage = (error: unknown): string => {
    if (!axios.isAxiosError(error)) {
      return "Failed to start delivery";
    }
    const message = error.response?.data?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    return "Failed to start delivery";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!vehicle) {
      toast.error("Please select a vehicle");
      return;
    }

    if (requiresCheckout && !vehicleCheckedOut) {
      toast.error("Vehicle must be checked out before starting a delivery");
      return;
    }

    if (requiresCheckout && vehicleDeliveryRunActive) {
      toast.error("Vehicle is currently in use on an active delivery run");
      return;
    }

    setIsLoading(true);
    try {
      await onCreateDelivery(vehicle);
      setVehicle("");
      onClose();
    } catch (error) {
      console.error("Failed to create delivery:", error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setVehicle("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start Delivery</DialogTitle>
          <DialogDescription>
            Create a delivery run for {selectedOrdersCount} selected order{selectedOrdersCount !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="text-xs text-muted-foreground">Runner: {runnerDisplay}</div>

            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="vehicle" className="text-right">
                Vehicle
              </label>
              <select
                id="vehicle"
                value={vehicle}
                onChange={(e) => applyVehicleSelection(e.target.value)}
                className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              >
                <option value="">Select a vehicle</option>
                <option value="van">Van</option>
                <option value="golf_cart">Golf Cart</option>
              </select>
            </div>

            {requiresCheckout && vehicle && !vehicleCheckedOut ? (
              <div className="text-xs text-muted-foreground">
                Vehicle must be checked out before starting a delivery.
              </div>
            ) : null}

            {requiresCheckout && vehicle && vehicleCheckedOutBySomeoneElse ? (
              <div className="text-xs text-muted-foreground">
                Vehicle is checked out by {vehicleCheckedOutBy}. You must check it out to start a run.
              </div>
            ) : null}

            {requiresCheckout && vehicle && vehicleDeliveryRunActive ? (
              <div className="text-xs text-muted-foreground">
                Vehicle is currently in use on an active delivery run.
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading ||
                (requiresCheckout &&
                  Boolean(vehicle) &&
                  (!vehicleCheckedOut || vehicleDeliveryRunActive))
              }
            >
              {isLoading ? "Starting..." : "Start Delivery"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
