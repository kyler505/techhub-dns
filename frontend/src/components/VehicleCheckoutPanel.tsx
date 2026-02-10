import { useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Link } from "react-router-dom";

import {
  vehicleCheckoutsApi,
  type Vehicle,
  type VehicleStatusItem,
  type VehicleCheckoutType,
} from "../api/vehicleCheckouts";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { useAuth } from "../contexts/AuthContext";

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
  statuses,
  isLoading,
  refresh,
  readonly,
}: {
  statuses: VehicleStatusItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  readonly?: boolean;
}) {
  const { user } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);

  const [checkoutType, setCheckoutType] = useState<VehicleCheckoutType>("delivery_run");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  const statusByVehicle = useMemo(() => {
    const map = new Map<Vehicle, VehicleStatusItem>();
    for (const item of statuses) {
      map.set(item.vehicle, item);
    }
    return map;
  }, [statuses]);

  const openCheckout = (vehicle: Vehicle) => {
    setActiveVehicle(vehicle);
    setCheckoutType("delivery_run");
    setPurpose("");
    setNotes("");
    setCheckoutOpen(true);
  };

  const openCheckin = (vehicle: Vehicle) => {
    setActiveVehicle(vehicle);
    setNotes("");
    setCheckinOpen(true);
  };

  const handleCheckout = async () => {
    const vehicle = activeVehicle;
    if (!vehicle) return;

    if (checkoutType === "other" && !purpose.trim()) {
      toast.error("Purpose is required for 'Other' checkouts");
      return;
    }

    try {
      setIsSubmitting(true);
      await vehicleCheckoutsApi.checkout({
        vehicle,
        checkout_type: checkoutType,
        purpose: purpose.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Vehicle checked out");
      setCheckoutOpen(false);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckin = async () => {
    const vehicle = activeVehicle;
    if (!vehicle) return;

    try {
      setIsSubmitting(true);
      await vehicleCheckoutsApi.checkin({
        vehicle,
        notes: notes.trim() || undefined,
      });
      toast.success("Vehicle checked in");
      setCheckinOpen(false);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Vehicles</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {VEHICLES.map(({ vehicle, label }) => {
            const status = statusByVehicle.get(vehicle);
            const checkedOutBy = status?.checked_out_by ?? null;
            const checkedOut = Boolean(status?.checked_out);
            const runActive = Boolean(status?.delivery_run_active);
            const disableActions = Boolean(readonly) || isLoading || isSubmitting || runActive;

            const type = status?.checkout_type ?? null;
            const purposeText = (status?.purpose ?? "").trim() || null;
            const typeLabel = type === "other" ? "Other" : type === "delivery_run" ? "Delivery run" : null;

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
                  {checkedOut ? (
                    <div className="space-y-1">
                      <div>{`Checked out by: ${checkedOutBy ?? "Unknown"}`}</div>
                      {typeLabel ? <div>{`Type: ${typeLabel}`}</div> : null}
                      {purposeText ? <div>{`Purpose: ${purposeText}`}</div> : null}
                    </div>
                  ) : (
                    "Not checked out"
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {!checkedOut ? (
                    <Button
                      size="sm"
                      onClick={() => openCheckout(vehicle)}
                      disabled={disableActions}
                    >
                      Check Out
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCheckin(vehicle)}
                      disabled={disableActions}
                    >
                      Check In
                    </Button>
                  )}

                  <Button asChild size="sm" variant="ghost" disabled={isLoading || isSubmitting}>
                    <Link to={`/delivery/fleet/${vehicle}/history`}>History</Link>
                  </Button>
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
            <div className="text-xs text-muted-foreground">
              Checked out as: {user?.display_name || user?.email || "your account"}
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Checkout type</label>
              <select
                value={checkoutType}
                onChange={(e) => setCheckoutType(e.target.value as VehicleCheckoutType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="delivery_run">Delivery run</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">
                Purpose{checkoutType === "other" ? " (required)" : " (optional)"}
              </label>
              <Input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={checkoutType === "other" ? "e.g., Maintenance" : "e.g., Morning delivery run"}
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
            <Button onClick={handleCheckout} disabled={isLoading || isSubmitting}>
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
            <div className="text-xs text-muted-foreground">
              Checking in as: {user?.display_name || user?.email || "your account"}
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
            <Button onClick={handleCheckin} disabled={isLoading || isSubmitting}>
              Check In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
