import type { ReactNode } from "react";

import type { VehicleStatusItem } from "../../api/vehicleCheckouts";
import { Badge } from "../ui/badge";
import { derivePrioritySemantics, formatTimeSince } from "./vehiclePriority";

type Props = {
  label: string;
  status: VehicleStatusItem;
  isLoading?: boolean;
  children?: ReactNode;
};

function getDispatchabilityBadgeVariant(
  dispatchability: "available" | "in_use" | "recallable"
): "success" | "warning" | "secondary" {
  if (dispatchability === "available") return "success";
  if (dispatchability === "in_use") return "warning";
  return "secondary";
}

function getPriorityBadgeVariant(tier: "P1" | "P2" | "P3"): "destructive" | "warning" | "secondary" {
  if (tier === "P1") return "destructive";
  if (tier === "P2") return "warning";
  return "secondary";
}

export default function VehicleCommandCard({ label, status, isLoading, children }: Props) {
  const priority = derivePrioritySemantics(status);
  const checkedOutBy = status.checked_out_by?.trim() || "None";
  const purpose = status.purpose?.trim() || null;
  const since = formatTimeSince(status.checked_out_at);

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{label}</div>
        <Badge variant={getDispatchabilityBadgeVariant(priority.dispatchability)}>
          {priority.dispatchabilityLabel}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={getPriorityBadgeVariant(priority.tier)}>{priority.label}</Badge>
        {priority.isRecallable ? (
          <span className="rounded border border-dashed border-border px-2 py-0.5 text-muted-foreground">Recallable</span>
        ) : null}
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {isLoading ? (
          <div>Status syncing...</div>
        ) : (
          <>
            <div>{`Holder: ${status.checked_out ? checkedOutBy : "None"}`}</div>
            {purpose ? <div>{`Reason: ${purpose}`}</div> : null}
            {status.delivery_run_active && since ? <div>{`Last action: ${since}`}</div> : null}
          </>
        )}
      </div>

      {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
