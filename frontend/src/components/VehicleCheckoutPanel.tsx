import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";

import {
  vehicleCheckoutsApi,
  type Vehicle,
  type VehicleStatusItem,
} from "../api/vehicleCheckouts";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

type VehicleDescriptor = {
  vehicle: Vehicle;
  label: string;
};

const VEHICLES: VehicleDescriptor[] = [
  { vehicle: "van", label: "Van" },
  { vehicle: "golf_cart", label: "Golf Cart" },
];

function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "Unexpected error";
  }

  const message = error.response?.data?.error?.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return "Request failed";
}

export default function VehicleCheckoutPanel({
  onStatusesChange,
}: {
  onStatusesChange?: (statuses: VehicleStatusItem[]) => void;
}) {
  const [statuses, setStatuses] = useState<VehicleStatusItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  const statusByVehicle = useMemo(() => {
    const map = new Map<Vehicle, VehicleStatusItem>();
    for (const item of statuses ?? []) {
      map.set(item.vehicle, item);
    }
    return map;
  }, [statuses]);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const response = await vehicleCheckoutsApi.getStatuses();
      setStatuses(response.vehicles);
      onStatusesChange?.(response.vehicles);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openCheckout = (vehicle: Vehicle) => {
    setActiveVehicle(vehicle);
    setName("");
    setPurpose("");
    setNotes("");
    setCheckoutOpen(true);
  };

  const openCheckin = (vehicle: Vehicle) => {
    setActiveVehicle(vehicle);
    setName("");
    setNotes("");
    setCheckinOpen(true);
  };

  const handleCheckout = async () => {
    const vehicle = activeVehicle;
    if (!vehicle) return;

    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    try {
      await vehicleCheckoutsApi.checkout({
        vehicle,
        checked_out_by: name.trim(),
        purpose: purpose.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Vehicle checked out");
      setCheckoutOpen(false);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleCheckin = async () => {
    const vehicle = activeVehicle;
    if (!vehicle) return;

    try {
      await vehicleCheckoutsApi.checkin({
        vehicle,
        checked_in_by: name.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Vehicle checked in");
      setCheckinOpen(false);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Vehicles</div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {VEHICLES.map(({ vehicle, label }) => {
            const status = statusByVehicle.get(vehicle);
            const checkedOutBy = status?.checked_out_by ?? null;
            const checkedOut = Boolean(status?.checked_out);
            const runActive = Boolean(status?.delivery_run_active);

            return (
              <div
                key={vehicle}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="flex items-center gap-2">
                    {runActive ? (
                      <Badge variant="warning">Active Run</Badge>
                    ) : checkedOut ? (
                      <Badge variant="secondary">Checked Out</Badge>
                    ) : (
                      <Badge>Available</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  {checkedOut ? `Checked out by: ${checkedOutBy ?? "Unknown"}` : "Not checked out"}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {!checkedOut ? (
                    <Button
                      size="sm"
                      onClick={() => openCheckout(vehicle)}
                      disabled={isLoading || runActive}
                    >
                      Check Out
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCheckin(vehicle)}
                      disabled={isLoading || runActive}
                    >
                      Check In
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check Out Vehicle</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Alice"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Purpose (optional)</label>
              <Input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g., Morning delivery run"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCheckout} disabled={isLoading}>
              Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In Vehicle</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Name (optional)</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Alice"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckinOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCheckin} disabled={isLoading}>
              Check In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
