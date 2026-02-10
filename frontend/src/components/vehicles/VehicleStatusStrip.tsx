import type { Vehicle, VehicleStatusItem } from "../../api/vehicleCheckouts";
import { Badge } from "../ui/badge";

type Props = {
  statusByVehicle: Record<Vehicle, VehicleStatusItem>;
  isLoading?: boolean;
};

function getStatusBadge(status: VehicleStatusItem): { label: string; variant: "warning" | "secondary" | "default" } {
  if (status.delivery_run_active) {
    return { label: "Active Run", variant: "warning" };
  }
  if (status.checked_out) {
    return { label: "Checked Out", variant: "secondary" };
  }
  return { label: "Available", variant: "default" };
}

function VehicleTile({
  label,
  status,
  isLoading,
}: {
  label: string;
  status: VehicleStatusItem;
  isLoading?: boolean;
}) {
  const badge = getStatusBadge(status);
  const checkedOutBy = status.checked_out_by ?? null;

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{label}</div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {isLoading
          ? "Loading status..."
          : status.checked_out
            ? `Checked out by: ${checkedOutBy ?? "Unknown"}`
            : "Not checked out"}
      </div>
    </div>
  );
}

export function VehicleStatusStrip({ statusByVehicle, isLoading }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <VehicleTile label="Van" status={statusByVehicle.van} isLoading={isLoading} />
      <VehicleTile label="Golf Cart" status={statusByVehicle.golf_cart} isLoading={isLoading} />
    </div>
  );
}
