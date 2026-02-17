import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { DeliveryRunResponse } from "../../api/deliveryRuns";
import type { ListVehicleCheckoutsResponse, VehicleStatusItem } from "../../api/vehicleCheckouts";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DELIVERY_RUN_PRIORITY_OPTIONS,
  derivePrioritySemantics,
  formatTimeSince,
  getPriorityActionSelection,
  type DeliveryRunPriorityPurpose,
} from "./vehiclePriority";

type VehicleCheckoutHistoryItem = ListVehicleCheckoutsResponse["items"][number];

type Props = {
  label: string;
  status: VehicleStatusItem;
  isLoading?: boolean;
  isActionLoading?: boolean;
  onCheckoutOther?: (priorityPurpose: DeliveryRunPriorityPurpose) => Promise<void>;
  onCheckin?: () => Promise<void>;
  onStartRun?: (priorityPurpose: DeliveryRunPriorityPurpose) => Promise<void>;
  startRunDisabledReason?: string | null;
  historyOpen?: boolean;
  historyLoading?: boolean;
  historyCheckouts?: VehicleCheckoutHistoryItem[];
  historyRuns?: DeliveryRunResponse[];
  onToggleHistory?: () => void;
  isOwnedByCurrentUser?: boolean;
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

function formatCheckoutType(checkoutType: VehicleCheckoutHistoryItem["checkout_type"]): string {
  if (checkoutType === "delivery_run") return "Delivery";
  return "Other";
}

function formatTimestamp(isoDate: string | null | undefined): string {
  if (!isoDate) return "No timestamp";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "No timestamp";
  return parsed.toLocaleString();
}

function formatRunLabel(run: DeliveryRunResponse): string {
  if (run.name?.trim()) return run.name;
  if (run.id.length <= 8) return `Run ${run.id}`;
  return `Run ${run.id.slice(0, 8)}`;
}

export default function VehicleCommandCard({
  label,
  status,
  isLoading,
  isActionLoading,
  onCheckoutOther,
  onCheckin,
  onStartRun,
  startRunDisabledReason,
  historyOpen,
  historyLoading,
  historyCheckouts,
  historyRuns,
  onToggleHistory,
  isOwnedByCurrentUser,
  children,
}: Props) {
  const priority = derivePrioritySemantics(status);
  const checkedOutBy = status.checked_out_by?.trim() || "None";
  const purpose = status.purpose?.trim() || null;
  const since = formatTimeSince(status.checked_out_at);
  const [selectedPriority, setSelectedPriority] = useState<DeliveryRunPriorityPurpose | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const canCheckoutOther = !status.checked_out && !status.delivery_run_active;
  const canCheckin = status.checked_out;
  const isCheckedOutByAnotherUser = status.checked_out && !isOwnedByCurrentUser;
  const hasActions = Boolean(onCheckoutOther && onCheckin && onStartRun);
  const hasHistory = Boolean(onToggleHistory);
  const resolvedHistoryOpen = historyOpen ?? false;
  const resolvedHistoryLoading = historyLoading ?? false;
  const resolvedHistoryCheckouts = historyCheckouts ?? [];
  const resolvedHistoryRuns = historyRuns ?? [];
  const resolvedStartDisabledReason = startRunDisabledReason ?? null;

  const selectedAction = selectedPriority ? getPriorityActionSelection(selectedPriority) : null;
  const isPriorityForStartRun = selectedAction?.createsRun ?? false;
  const isActionDisabled = selectedAction
    ? isPriorityForStartRun
      ? isLoading || isActionLoading || Boolean(resolvedStartDisabledReason)
      : isLoading || isActionLoading || !canCheckoutOther
    : true;

  const actionDisabledReason = selectedAction
    ? isPriorityForStartRun
      ? resolvedStartDisabledReason
      : status.delivery_run_active
        ? "Vehicle already has an active run"
        : status.checked_out
          ? "Vehicle is already checked out. Check in before checking out again."
          : null
    : null;

  const handlePrimaryAction = async () => {
    if (!selectedPriority) {
      setPriorityError("Select a purpose before continuing.");
      return;
    }

    setPriorityError(null);
    if (getPriorityActionSelection(selectedPriority).createsRun) {
      await onStartRun?.(selectedPriority);
      return;
    }
    await onCheckoutOther?.(selectedPriority);
  };

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

        {hasActions ? (
          <>
          {!isOwnedByCurrentUser ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-medium text-foreground">Purpose (required)</div>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_RUN_PRIORITY_OPTIONS.map((option) => {
                  const action = getPriorityActionSelection(option.purpose);
                  const isCheckoutAction = !action.createsRun;
                  const isDisabled = isLoading || isActionLoading || (isCheckoutAction && isCheckedOutByAnotherUser);
                  const isSelected = selectedPriority === option.purpose;
                  return (
                    <Button
                      key={option.purpose}
                      size="sm"
                      variant="outline"
                      className={
                        isSelected
                          ? "border-accent bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground"
                          : "border-border bg-background text-foreground"
                      }
                      onClick={() => {
                        setSelectedPriority(option.purpose);
                        setPriorityError(null);
                      }}
                      disabled={isDisabled}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              {priorityError ? <div className="text-xs text-destructive">{priorityError}</div> : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isOwnedByCurrentUser ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void onCheckin?.()}
                disabled={isLoading || isActionLoading || !canCheckin}
              >
                Check in
              </Button>
            ) : null}
            {!isOwnedByCurrentUser ? (
              <Button
                size="sm"
                onClick={() => void handlePrimaryAction()}
                disabled={isActionDisabled}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {selectedAction?.buttonLabel ?? "Select Purpose"}
              </Button>
            ) : null}
          </div>

          {actionDisabledReason ? (
            <div className="mt-2 text-xs text-muted-foreground">{actionDisabledReason}</div>
          ) : null}
        </>
      ) : null}

      {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}

      {hasHistory ? (
        <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-foreground">History</div>
          <Button variant="ghost" size="sm" onClick={onToggleHistory}>
            {resolvedHistoryOpen ? "Hide" : "Show"}
          </Button>
        </div>

        {resolvedHistoryOpen ? (
          <div className="mt-2 space-y-3">
            {resolvedHistoryLoading ? (
              <div className="rounded border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                Loading history...
              </div>
            ) : resolvedHistoryCheckouts.length === 0 && resolvedHistoryRuns.length === 0 ? (
              <div className="rounded border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                No history available
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-foreground">Checkouts</div>
                  {resolvedHistoryCheckouts.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No checkout history</div>
                  ) : (
                    resolvedHistoryCheckouts.map((checkout) => (
                      <div key={checkout.id} className="rounded border border-border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {formatCheckoutType(checkout.checkout_type)}
                            {checkout.purpose?.trim() ? ` - ${checkout.purpose.trim()}` : ""}
                          </span>
                          <span className="text-muted-foreground">{formatTimestamp(checkout.checked_out_at)}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {checkout.checked_out_by}
                          {checkout.checked_in_at ? ` - checked in ${formatTimestamp(checkout.checked_in_at)}` : " - active"}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-foreground">Delivery runs</div>
                  {resolvedHistoryRuns.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No delivery runs</div>
                  ) : (
                    resolvedHistoryRuns.map((run) => (
                      <div key={run.id} className="rounded border border-border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{formatRunLabel(run)}</span>
                          <Badge variant="secondary">{run.status}</Badge>
                        </div>
                        <div className="mt-1 text-muted-foreground">{formatTimestamp(run.end_time ?? run.start_time)}</div>
                        <Link
                          className="mt-2 inline-flex text-xs font-medium text-foreground hover:underline"
                          to={`/delivery/runs/${run.id}`}
                          state={{ from: "/delivery/dispatch" }}
                        >
                          View run
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
