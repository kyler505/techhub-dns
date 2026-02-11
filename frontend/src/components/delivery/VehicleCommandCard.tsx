import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { DeliveryRunResponse } from "../../api/deliveryRuns";
import type { ListVehicleCheckoutsResponse, VehicleStatusItem } from "../../api/vehicleCheckouts";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  DELIVERY_RUN_PRIORITY_OPTIONS,
  derivePrioritySemantics,
  formatTimeSince,
  type DeliveryRunPriorityPurpose,
} from "./vehiclePriority";

type VehicleCheckoutHistoryItem = ListVehicleCheckoutsResponse["items"][number];

type Props = {
  label: string;
  status: VehicleStatusItem;
  isLoading?: boolean;
  isActionLoading?: boolean;
  onCheckoutOther?: (purpose: string) => Promise<boolean>;
  onCheckin?: () => Promise<void>;
  onStartRun?: (priorityPurpose: DeliveryRunPriorityPurpose) => Promise<void>;
  startRunDisabledReason?: string | null;
  historyOpen?: boolean;
  historyLoading?: boolean;
  historyCheckouts?: VehicleCheckoutHistoryItem[];
  historyRuns?: DeliveryRunResponse[];
  onToggleHistory?: () => void;
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
  children,
}: Props) {
  const priority = derivePrioritySemantics(status);
  const checkedOutBy = status.checked_out_by?.trim() || "None";
  const purpose = status.purpose?.trim() || null;
  const since = formatTimeSince(status.checked_out_at);
  const [checkoutPurpose, setCheckoutPurpose] = useState("");
  const [checkoutFormOpen, setCheckoutFormOpen] = useState(false);
  const [runPriority, setRunPriority] = useState<DeliveryRunPriorityPurpose | null>(null);
  const [runPriorityError, setRunPriorityError] = useState<string | null>(null);

  const canCheckoutOther = !status.checked_out && !status.delivery_run_active;
  const canCheckin = status.checked_out;
  const hasActions = Boolean(onCheckoutOther && onCheckin && onStartRun);
  const hasHistory = Boolean(onToggleHistory);
  const resolvedHistoryOpen = historyOpen ?? false;
  const resolvedHistoryLoading = historyLoading ?? false;
  const resolvedHistoryCheckouts = historyCheckouts ?? [];
  const resolvedHistoryRuns = historyRuns ?? [];
  const resolvedStartDisabledReason = startRunDisabledReason ?? null;

  const handleCheckoutOther = async () => {
    const trimmedPurpose = checkoutPurpose.trim();
    if (!trimmedPurpose) return;
    if (!onCheckoutOther) return;
    const success = await onCheckoutOther(trimmedPurpose);
    if (!success) return;
    setCheckoutPurpose("");
    setCheckoutFormOpen(false);
  };

  const handleStartRun = async () => {
    if (!onStartRun) return;
    if (!runPriority) {
      setRunPriorityError("Select a run priority before starting.");
      return;
    }

    setRunPriorityError(null);
    await onStartRun(runPriority);
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCheckoutFormOpen((previous) => !previous)}
              disabled={isLoading || isActionLoading || !canCheckoutOther}
            >
              Check out (Other)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onCheckin?.()}
              disabled={isLoading || isActionLoading || !canCheckin}
            >
              Check in
            </Button>
            <Button
              size="sm"
              onClick={() => void handleStartRun()}
              disabled={isLoading || isActionLoading || Boolean(resolvedStartDisabledReason)}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Start Run
            </Button>
          </div>

          <div className="mt-2 space-y-2">
            <div className="text-xs font-medium text-foreground">Run priority (required)</div>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_RUN_PRIORITY_OPTIONS.map((option) => (
                <Button
                  key={option.purpose}
                  size="sm"
                  variant={runPriority === option.purpose ? "default" : "outline"}
                  onClick={() => {
                    setRunPriority(option.purpose);
                    setRunPriorityError(null);
                  }}
                  disabled={isLoading || isActionLoading || Boolean(resolvedStartDisabledReason)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {runPriorityError ? <div className="text-xs text-destructive">{runPriorityError}</div> : null}
          </div>

          {resolvedStartDisabledReason ? (
            <div className="mt-2 text-xs text-muted-foreground">{resolvedStartDisabledReason}</div>
          ) : null}

          {checkoutFormOpen ? (
            <div className="mt-3 rounded border border-border p-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <Input
                  value={checkoutPurpose}
                  onChange={(event) => setCheckoutPurpose(event.target.value)}
                  placeholder="Purpose (required)"
                  disabled={isLoading || isActionLoading}
                />
                <Button
                  size="sm"
                  onClick={() => void handleCheckoutOther()}
                  disabled={isLoading || isActionLoading || !checkoutPurpose.trim()}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCheckoutFormOpen(false)}
                  disabled={isLoading || isActionLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
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
