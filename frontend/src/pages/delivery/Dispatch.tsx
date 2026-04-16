import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AlertTriangle, ChevronDown, ChevronUp, Truck } from "lucide-react";
import { toast } from "sonner";

import { deliveryRunsApi } from "../../api/deliveryRuns";
import { ordersApi } from "../../api/orders";
import {
  type Vehicle,
  type VehicleStatusItem,
  vehicleCheckoutsApi,
} from "../../api/vehicleCheckouts";
import DispatchOrderLane from "../../components/delivery/DispatchOrderLane";
import {
  DELIVERY_RUN_PRIORITY_OPTIONS,
  getPriorityActionSelection,
  formatTimeSince,
  type DeliveryRunPriorityPurpose,
} from "../../components/delivery/vehiclePriority";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useAuth } from "../../contexts/AuthContext";
import { isValidOrderId } from "../../utils/orderIds";
import { useOrdersWebSocket } from "../../hooks/useOrdersWebSocket";
import { useVehicleStatuses } from "../../hooks/useVehicleStatuses";
import type { User } from "../../contexts/AuthContext";
import type { Order } from "../../types/order";
import { OrderStatus } from "../../types/order";
import { formatDeliveryLocation } from "../../utils/location";

type VehicleDescriptor = {
  id: Vehicle;
  label: string;
  icon: string;
};

const VEHICLES: VehicleDescriptor[] = [
  { id: "van", label: "Van", icon: "🚐" },
  { id: "golf_cart", label: "Golf Cart", icon: "🏌️" },
];

function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return "Request failed";
  const message = error.response?.data?.error?.message;
  if (typeof message === "string" && message.trim()) return message;
  return "Request failed";
}

function checkedOutByCurrentUser(status: VehicleStatusItem, user: User | null): boolean {
  if (!status.checked_out) return false;

  const checkedOutByUserId = status.checked_out_by_user_id;
  if (checkedOutByUserId && user?.id) {
    return checkedOutByUserId === user.id;
  }

  const checkedOutBy = status.checked_out_by;
  if (!checkedOutBy) return false;

  const candidates = [user?.display_name, user?.email].filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim())
  );
  return candidates.some((candidate) => candidate === checkedOutBy);
}

function formatRunLabel(deliveryRunId: string | undefined): string {
  if (!deliveryRunId) return "No run";
  if (deliveryRunId.length <= 8) return `Run ${deliveryRunId}`;
  return `Run ${deliveryRunId.slice(0, 8)}`;
}

function formatVehicleStatus(status: VehicleStatusItem): string {
  if (status.delivery_run_active) return "Active run";
  if (!status.checked_out) return "Available";
  if (status.checkout_type === "delivery_run") return "On delivery";
  const purpose = status.purpose?.trim();
  return purpose ? purpose : "Checked out";
}

function getVehicleStatusVariant(
  status: VehicleStatusItem
): "success" | "warning" | "secondary" {
  if (!status.checked_out && !status.delivery_run_active) return "success";
  if (status.delivery_run_active) return "warning";
  return "secondary";
}

export default function DeliveryDispatchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orders: websocketOrders } = useOrdersWebSocket();
  const { statusByVehicle, isLoading: statusesLoading, refresh: refreshStatuses } = useVehicleStatuses();

  const [preDeliveryOrders, setPreDeliveryOrders] = useState<Order[]>([]);
  const [inDeliveryOrders, setInDeliveryOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [activeVehicleAction, setActiveVehicleAction] = useState<Vehicle | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<Vehicle | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState<DeliveryRunPriorityPurpose | null>(null);

  const [partialPickDialogOpen, setPartialPickDialogOpen] = useState(false);
  const [partialPickOrders, setPartialPickOrders] = useState<Order[]>([]);
  const [pendingStartVehicle, setPendingStartVehicle] = useState<Vehicle | null>(null);
  const [pendingStartPriority, setPendingStartPriority] = useState<DeliveryRunPriorityPurpose | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeRunsExpanded, setActiveRunsExpanded] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pre, inDelivery] = await Promise.all([
        ordersApi.getOrders({ status: OrderStatus.PRE_DELIVERY }),
        ordersApi.getOrders({ status: OrderStatus.IN_DELIVERY }),
      ]);
      setPreDeliveryOrders(pre);
      setInDeliveryOrders(inDelivery);
    } catch (error) {
      const message = getApiErrorMessage(error);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    void refreshStatuses();
  }, [loadOrders, refreshStatuses, websocketOrders]);

  // Auto-select available vehicle
  useEffect(() => {
    if (selectedVehicleId) return;
    const available = VEHICLES.find(
      (v) => !statusByVehicle[v.id].checked_out && !statusByVehicle[v.id].delivery_run_active
    );
    if (available) setSelectedVehicleId(available.id);
  }, [selectedVehicleId, statusByVehicle]);

  const selectedOrdersList = useMemo(
    () => preDeliveryOrders.filter((order) => selectedOrders.has(order.id)),
    [preDeliveryOrders, selectedOrders]
  );

  useEffect(() => {
    setSelectedOrders((previous) => {
      if (previous.size === 0) return previous;
      const availableIds = new Set(preDeliveryOrders.map((order) => order.id));
      const next = new Set(Array.from(previous).filter((orderId) => availableIds.has(orderId)));
      return next.size === previous.size ? previous : next;
    });
  }, [preDeliveryOrders]);

  const preDeliveryFilteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return preDeliveryOrders;

    return preDeliveryOrders.filter((order) => {
      const haystack = [
        order.inflow_order_id,
        order.recipient_name,
        order.assigned_deliverer,
        formatDeliveryLocation(order),
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [preDeliveryOrders, searchTerm]);

  const needsAttentionOrders = useMemo(
    () => preDeliveryFilteredOrders.filter((order) => Boolean(order.pick_status && !order.pick_status.is_fully_picked)),
    [preDeliveryFilteredOrders]
  );

  const readyOrders = useMemo(
    () => preDeliveryFilteredOrders.filter((order) => !order.pick_status || order.pick_status.is_fully_picked),
    [preDeliveryFilteredOrders]
  );

  const activeDeliveryPreview = useMemo(() => {
    const sorted = [...inDeliveryOrders].sort((left, right) => {
      const leftTime = Date.parse(left.updated_at);
      const rightTime = Date.parse(right.updated_at);
      const safeLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
      const safeRightTime = Number.isNaN(rightTime) ? 0 : rightTime;
      return safeRightTime - safeLeftTime;
    });
    return sorted.slice(0, 6);
  }, [inDeliveryOrders]);

  const allVisibleSelected =
    preDeliveryFilteredOrders.length > 0 && preDeliveryFilteredOrders.every((order) => selectedOrders.has(order.id));

  const selectedPartialPickCount = useMemo(
    () => selectedOrdersList.filter((order) => order.pick_status && !order.pick_status.is_fully_picked).length,
    [selectedOrdersList]
  );

  // Determine vehicle availability for action bar

  const getStartDisabledReason = useCallback(
    (vehicle: Vehicle): string | null => {
      const status = statusByVehicle[vehicle];
      if (selectedOrders.size === 0) return "Select pre-delivery orders";
      if (statusesLoading) return "Vehicle status is loading";

      if (status.delivery_run_active) {
        return "Vehicle already has an active run";
      }

      if (status.checked_out) {
        if (status.checkout_type === "other") {
          const purpose = status.purpose?.trim();
          const suffix = purpose ? ` (purpose: ${purpose})` : "";
          return `Checked out for Other${suffix}. Check in, then check out again for a Delivery run.`;
        }

        if (!checkedOutByCurrentUser(status, user)) {
          const who = status.checked_out_by;
          return who ? `Checked out by ${who}` : "Checked out by another user";
        }
      }

      return null;
    },
    [selectedOrders.size, statusByVehicle, statusesLoading, user]
  );

  const handleToggleVisible = () => {
    if (allVisibleSelected) {
      setSelectedOrders((previous) => {
        const next = new Set(previous);
        for (const order of preDeliveryFilteredOrders) {
          next.delete(order.id);
        }
        return next;
      });
      return;
    }

    setSelectedOrders((previous) => {
      const next = new Set(previous);
      for (const order of preDeliveryFilteredOrders) {
        next.add(order.id);
      }
      return next;
    });
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders((previous) => {
      const next = new Set(previous);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const doStartRun = async (
    vehicle: Vehicle,
    checkoutPurpose: DeliveryRunPriorityPurpose,
    options?: {
      skipPartialPickConfirm?: boolean;
    }
  ) => {
    if (selectedOrders.size === 0) {
      toast.error("Select at least one order to start a run");
      return;
    }

    if (!options?.skipPartialPickConfirm) {
      const partialPicks = selectedOrdersList.filter(
        (order) => order.pick_status && !order.pick_status.is_fully_picked
      );
      if (partialPicks.length > 0) {
        setPartialPickOrders(partialPicks);
        setPendingStartVehicle(vehicle);
        setPendingStartPriority(checkoutPurpose);
        setPartialPickDialogOpen(true);
        return;
      }
    }

    try {
      const status = statusByVehicle[vehicle];
      if (status.delivery_run_active) {
        toast.error("Vehicle already has an active run");
        await refreshStatuses();
        return;
      }

      if (status.checked_out) {
        if (status.checkout_type === "other") {
          const purpose = status.purpose?.trim();
          const suffix = purpose ? ` (purpose: ${purpose})` : "";
          toast.error(`Checked out for Other${suffix}. Check in, then check out again for a Delivery run.`);
          await refreshStatuses();
          return;
        }

        const checkedOutByUserId = status.checked_out_by_user_id;
        const checkedOutByName = status.checked_out_by;
        const currentUserId = user?.id ?? null;
        const currentUserCandidates = [user?.display_name, user?.email].filter(
          (value): value is string => typeof value === "string" && Boolean(value.trim())
        );
        const isCheckedOutByCurrentUser =
          (checkedOutByUserId && currentUserId && checkedOutByUserId === currentUserId) ||
          (checkedOutByName ? currentUserCandidates.includes(checkedOutByName) : false);

        if (!isCheckedOutByCurrentUser) {
          toast.error(checkedOutByName ? `Checked out by ${checkedOutByName}` : "Checked out by another user");
          await refreshStatuses();
          return;
        }
      } else {
        await vehicleCheckoutsApi.checkout({
          vehicle,
          checkout_type: "delivery_run",
          purpose: checkoutPurpose,
        });
      }

      await deliveryRunsApi.createRun({
        order_ids: Array.from(selectedOrders),
        vehicle,
      });
      toast.success("Delivery run started");
      setSelectedOrders(new Set());
      await Promise.all([loadOrders(), refreshStatuses()]);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      await refreshStatuses();
    }
  };

  const handleStartRun = useCallback(async (): Promise<void> => {
    const vehicle = selectedVehicleId;
    const purpose = selectedPurpose;
    if (!vehicle || !purpose) {
      toast.error("Select a vehicle and purpose");
      return;
    }

    if (!getPriorityActionSelection(purpose).createsRun) {
      // Non-delivery checkout
      setActiveVehicleAction(vehicle);
      try {
        const status = statusByVehicle[vehicle];
        if (status.delivery_run_active) {
          toast.error("Vehicle already has an active run");
          await refreshStatuses();
          return;
        }
        if (status.checked_out) {
          const checkedOutBy = status.checked_out_by?.trim();
          toast.error(checkedOutBy ? `Checked out by ${checkedOutBy}` : "Vehicle is already checked out");
          await refreshStatuses();
          return;
        }
        const action = getPriorityActionSelection(purpose);
        await vehicleCheckoutsApi.checkout({
          vehicle,
          checkout_type: action.checkoutType,
          purpose: action.purpose,
        });
        toast.success(`Vehicle checked out for ${action.purpose}`);
        setSelectedPurpose(null);
        await refreshStatuses();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
        await refreshStatuses();
      } finally {
        setActiveVehicleAction((current) => (current === vehicle ? null : current));
      }
      return;
    }

    const disabledReason = getStartDisabledReason(vehicle);
    if (disabledReason) return;

    setActiveVehicleAction(vehicle);
    try {
      await doStartRun(vehicle, purpose);
    } finally {
      setActiveVehicleAction((current) => (current === vehicle ? null : current));
    }
  }, [selectedVehicleId, selectedPurpose, doStartRun, getStartDisabledReason, statusByVehicle, refreshStatuses]);

  const handleCheckin = useCallback(async (vehicle: Vehicle): Promise<void> => {
    setActiveVehicleAction(vehicle);
    try {
      await vehicleCheckoutsApi.checkin({ vehicle });
      toast.success("Vehicle checked in");
      await refreshStatuses();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      await refreshStatuses();
    } finally {
      setActiveVehicleAction((current) => (current === vehicle ? null : current));
    }
  }, [refreshStatuses]);

  const handlePartialPickConfirm = async () => {
    setPartialPickDialogOpen(false);
    const vehicle = pendingStartVehicle;
    const checkoutPurpose = pendingStartPriority;
    setPendingStartVehicle(null);
    setPendingStartPriority(null);
    if (!vehicle || !checkoutPurpose) return;
    await doStartRun(vehicle, checkoutPurpose, { skipPartialPickConfirm: true });
  };

  const handlePartialPickDialogOpenChange = (open: boolean) => {
    setPartialPickDialogOpen(open);
    if (open) return;
    setPendingStartVehicle(null);
    setPendingStartPriority(null);
  };

  const handleViewDetail = (orderId?: string) => {
    if (!isValidOrderId(orderId)) {
      toast.error("Order details are unavailable for this row.");
      return;
    }
    navigate(`/orders/${orderId}`);
  };

  // Sticky action bar validation
  const actionBarBlocker = useMemo(() => {
    if (!selectedVehicleId) return "Pick a vehicle";
    if (!selectedPurpose) return "Pick a purpose";
    const action = getPriorityActionSelection(selectedPurpose);
    if (action.createsRun && selectedOrders.size === 0) return "Select orders";
    const reason = getStartDisabledReason(selectedVehicleId);
    if (reason) return reason;
    return null;
  }, [selectedOrders.size, selectedVehicleId, selectedPurpose, getStartDisabledReason]);

  const canStartRun = actionBarBlocker === null;
  const isActionLoading = selectedVehicleId ? activeVehicleAction === selectedVehicleId : false;
  const selectedAction = selectedPurpose ? getPriorityActionSelection(selectedPurpose) : null;

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-5 pb-28">
      {/* ── Active Delivery Orders (above the fold) ── */}
      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setActiveRunsExpanded((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Active Delivery</h2>
            <Badge variant="secondary">{inDeliveryOrders.length}</Badge>
          </div>
          {activeRunsExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {activeRunsExpanded && (
          <CardContent className="space-y-2 border-t px-4 py-3">
            {activeDeliveryPreview.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No orders are currently in delivery
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {activeDeliveryPreview.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="text-sm font-medium text-foreground hover:underline"
                        onClick={() => handleViewDetail(order.id)}
                      >
                        {order.inflow_order_id}
                      </button>
                      <div className="truncate text-xs text-muted-foreground">
                        {order.assigned_deliverer || "Unassigned"} — {formatDeliveryLocation(order) || "Unknown destination"}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {formatRunLabel(order.delivery_run_id)}
                    </Badge>
                  </div>
                ))}
                {inDeliveryOrders.length > activeDeliveryPreview.length && (
                  <div className="text-xs text-muted-foreground">
                    +{inDeliveryOrders.length - activeDeliveryPreview.length} more
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Vehicle Status (read-only display) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Vehicles:</span>
        {VEHICLES.map((vehicle) => {
          const status = statusByVehicle[vehicle.id];
          const since = formatTimeSince(status.checked_out_at);
          const isOwnedByMe = checkedOutByCurrentUser(status, user);

          return (
            <div
              key={vehicle.id}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
            >
              <span>{vehicle.icon}</span>
              <span className="font-medium">{vehicle.label}</span>
              <Badge variant={getVehicleStatusVariant(status)} className="text-[10px]">
                {formatVehicleStatus(status)}
              </Badge>
              {status.checked_out && since && (
                <span>{since}</span>
              )}
              {isOwnedByMe && status.checked_out && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => void handleCheckin(vehicle.id)}
                  disabled={isActionLoading}
                >
                  Check in
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pre-Delivery Orders ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Pre-Delivery Orders</h2>
            <p className="text-xs text-muted-foreground">
              {readyOrders.length} ready · {needsAttentionOrders.length} need attention
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search orders..."
              className="h-9 w-[220px] text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleVisible}
              disabled={preDeliveryFilteredOrders.length === 0}
              className="h-9"
            >
              {allVisibleSelected ? "Clear" : "Select all"}
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <span>Failed to refresh. {loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void loadOrders()}>
              Retry
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <DispatchOrderLane
            title="Needs Attention"
            description="Partial picks or exceptions to review."
            orders={needsAttentionOrders}
            selectedOrderIds={selectedOrders}
            emptyText="No exception orders"
            onToggleOrder={handleSelectOrder}
            onViewOrder={handleViewDetail}
          />
          <DispatchOrderLane
            title="Ready to Dispatch"
            description="Fully picked and ready for vehicle assignment."
            orders={readyOrders}
            selectedOrderIds={selectedOrders}
            emptyText="No ready orders"
            onToggleOrder={handleSelectOrder}
            onViewOrder={handleViewDetail}
          />
        </div>
      </section>

      {/* ── Sticky Action Bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {/* Selected count */}
          <div className="flex items-center gap-2 text-sm">
            {selectedOrders.size > 0 ? (
              <Badge variant="default" className="text-xs">
                {selectedOrders.size} selected
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">No orders selected</span>
            )}
            {selectedPartialPickCount > 0 && (
              <Badge variant="warning" className="text-[10px]">
                {selectedPartialPickCount} partial
              </Badge>
            )}
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Vehicle selector */}
          <div className="flex items-center gap-1.5">
            {VEHICLES.map((vehicle) => {
              const isActive = vehicle.id === selectedVehicleId;
              const status = statusByVehicle[vehicle.id];
              const canUse = !status.checked_out && !status.delivery_run_active;
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                    isActive
                      ? "border-accent bg-accent/10 text-foreground font-medium"
                      : "border-border text-muted-foreground hover:text-foreground"
                  } ${!canUse ? "opacity-50" : ""}`}
                  onClick={() => setSelectedVehicleId(vehicle.id)}
                >
                  {vehicle.icon} {vehicle.label}
                </button>
              );
            })}
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Purpose selector */}
          <div className="flex items-center gap-1.5">
            {DELIVERY_RUN_PRIORITY_OPTIONS.map((option) => {
              const isSelected = selectedPurpose === option.purpose;
              return (
                <button
                  key={option.purpose}
                  type="button"
                  className={`inline-flex h-8 items-center rounded-md border px-2 text-xs transition-colors ${
                    isSelected
                      ? "border-accent bg-accent text-accent-foreground font-medium"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setSelectedPurpose(option.purpose)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Action button */}
          {actionBarBlocker ? (
            <span className="text-xs text-muted-foreground">{actionBarBlocker}</span>
          ) : null}
          <Button
            onClick={() => void handleStartRun()}
            disabled={!canStartRun || isActionLoading}
            className="h-9 min-w-[120px]"
          >
            {isActionLoading
              ? "Starting..."
              : selectedAction?.buttonLabel ?? "Start Run"}
          </Button>
        </div>
      </div>

      {/* ── Partial Pick Dialog ── */}
      <Dialog open={partialPickDialogOpen} onOpenChange={handlePartialPickDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Partial Pick Warning
            </DialogTitle>
            <DialogDescription>
              {partialPickOrders.length} order{partialPickOrders.length > 1 ? "s are" : " is"} only partially picked.
              Only the picked items will be delivered. Any remaining items will return to Picked on the original order so asset tags, a new picklist, and order details can be redone.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto py-2">
            <ul className="space-y-1 text-sm">
              {partialPickOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between rounded bg-muted px-2 py-1">
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => {
                      handlePartialPickDialogOpenChange(false);
                      handleViewDetail(order.id);
                    }}
                  >
                    {order.inflow_order_id}
                  </button>
                  <span className="text-muted-foreground">
                    {order.pick_status?.total_picked}/{order.pick_status?.total_ordered} items
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handlePartialPickDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePartialPickConfirm} className="bg-amber-500 hover:bg-amber-600">
              Continue Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
