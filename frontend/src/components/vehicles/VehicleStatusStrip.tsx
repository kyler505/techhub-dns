import type { Vehicle, VehicleStatusItem } from "../../api/vehicleCheckouts";
import { Badge } from "../ui/badge";

type Props = {
  statusByVehicle: Record<Vehicle, VehicleStatusItem>;
  isLoading?: boolean;
};

type StatusBadge = { label: string; variant: "warning" | "secondary" | "default" };

type VehicleStatusMetaProps = {
  status: VehicleStatusItem;
  isLoading?: boolean;
  showType?: boolean;
  showPurpose?: boolean;
  checkedOutByFormat?: "full" | "short";
  loadingText?: string;
  className?: string;
};

export function getStatusBadge(status: VehicleStatusItem): StatusBadge {
  if (status.delivery_run_active) {
    return { label: "Active Run", variant: "warning" };
  }
  if (status.checked_out) {
    return { label: "Checked Out", variant: "secondary" };
  }
  return { label: "Available", variant: "default" };
}

function getCheckoutTypeLabel(status: VehicleStatusItem): string | null {
  if (status.checkout_type === "other") return "Other";
  if (status.checkout_type === "delivery_run") return "Delivery run";
  return null;
}

export function VehicleStatusMeta({
  status,
  isLoading,
  showType,
  showPurpose,
  checkedOutByFormat = "full",
  loadingText = "Loading status...",
  className = "mt-2 text-xs text-muted-foreground",
}: VehicleStatusMetaProps) {
  if (!isLoading && !status.checked_out) {
    return null;
  }

  if (isLoading) {
    return <div className={className}>{loadingText}</div>;
  }

  const checkedOutBy = status.checked_out_by ?? "Unknown";
  const checkedOutByLine =
    checkedOutByFormat === "short"
      ? `by ${checkedOutBy}`
      : `Checked out by: ${checkedOutBy}`;

  const typeLabel = showType ? getCheckoutTypeLabel(status) : null;
  const purposeText = showPurpose ? (status.purpose ?? "").trim() || null : null;

  if (!typeLabel && !purposeText) {
    return <div className={className}>{checkedOutByLine}</div>;
  }

  return (
    <div className={className}>
      <div className="space-y-1">
        <div>{checkedOutByLine}</div>
        {typeLabel ? <div>{`Type: ${typeLabel}`}</div> : null}
        {purposeText ? <div>{`Purpose: ${purposeText}`}</div> : null}
      </div>
    </div>
  );
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

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{label}</div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <VehicleStatusMeta status={status} isLoading={isLoading} />
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
