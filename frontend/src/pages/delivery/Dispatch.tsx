import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { deliveryRunsApi } from "../../api/deliveryRuns";
import { ordersApi } from "../../api/orders";
import {
  type Vehicle,
  type VehicleStatusItem,
  vehicleCheckoutsApi,
} from "../../api/vehicleCheckouts";
import VehicleCommandCard from "../../components/delivery/VehicleCommandCard";
import DispatchOrderLane from "../../components/delivery/DispatchOrderLane";
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
import { useOrdersWebSocket } from "../../hooks/useOrdersWebSocket";
import { useVehicleStatuses } from "../../hooks/useVehicleStatuses";
import type { User } from "../../contexts/AuthContext";
import type { Order } from "../../types/order";
import { OrderStatus } from "../../types/order";
import {
  getPriorityActionSelection,
  type DeliveryRunPriorityPurpose,
} from "../../components/delivery/vehiclePriority";
import { formatDeliveryLocation } from "../../utils/location";

type VehicleDescriptor = {
  id: Vehicle;
  label: string;
};

const VEHICLES: VehicleDescriptor[] = [
  { id: "van", label: "Van" },
  { id: "golf_cart", label: "Golf Cart" },
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
  const [selectedVehicleId, setSelectedVehicleId] = useState<Vehicle | null>(VEHICLES[0]?.id ?? null);

  const [partialPickDialogOpen, setPartialPickDialogOpen] = useState(false);
  const [partialPickOrders, setPartialPickOrders] = useState<Order[]>([]);
  const [pendingStartVehicle, setPendingStartVehicle] = useState<Vehicle | null>(null);
  const [pendingStartPriority, setPendingStartPriority] = useState<DeliveryRunPriorityPurpose | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exceptionBulkUpdating, setExceptionBulkUpdating] = useState(false);

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

  const selectedOrdersList = useMemo(
    () => preDeliveryOrders.filter((order) => selectedOrders.has(order.id)),
    [preDeliveryOrders, selectedOrders]
  );

  useEffect(() => {
    setSelectedOrders((previous) => {
      if (previous.size === 0) {
        return previous;
      }
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

  const selectedExceptionOrderIds = useMemo(() => {
    const exceptionIds = new Set(needsAttentionOrders.map((order) => order.id));
    return Array.from(selectedOrders).filter((orderId) => exceptionIds.has(orderId));
  }, [needsAttentionOrders, selectedOrders]);

  const selectedVehicle = useMemo(
    () => VEHICLES.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId]
  );

  const selectedLocationCount = useMemo(() => {
    const uniqueLocations = new Set<string>();
    for (const order of selectedOrdersList) {
      const location = formatDeliveryLocation(order).trim();
      if (!location) continue;
      uniqueLocations.add(location);
    }
    return uniqueLocations.size;
  }, [selectedOrdersList]);

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

  const handleSelectExceptionLane = () => {
    setSelectedOrders((previous) => {
      const next = new Set(previous);
      for (const order of needsAttentionOrders) {
        next.add(order.id);
      }
      return next;
    });
  };

  const handleClearExceptionSelection = () => {
    setSelectedOrders((previous) => {
      const exceptionIds = new Set(needsAttentionOrders.map((order) => order.id));
      return new Set(Array.from(previous).filter((orderId) => !exceptionIds.has(orderId)));
    });
  };

  const handleMoveExceptionsToIssue = async () => {
    if (selectedExceptionOrderIds.length === 0 || exceptionBulkUpdating) {
      return;
    }

    setExceptionBulkUpdating(true);
    try {
      await ordersApi.bulkUpdateStatus({
        order_ids: selectedExceptionOrderIds,
        status: OrderStatus.ISSUE,
      });

      toast.success(
        `Moved ${selectedExceptionOrderIds.length} order${selectedExceptionOrderIds.length === 1 ? "" : "s"} to Issue`
      );

      setSelectedOrders((previous) => {
        const next = new Set(previous);
        selectedExceptionOrderIds.forEach((orderId) => next.delete(orderId));
        return next;
      });

      await loadOrders();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setExceptionBulkUpdating(false);
    }
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

  const handleStartRun = useCallback(
    async (vehicle: Vehicle, checkoutPurpose: DeliveryRunPriorityPurpose): Promise<void> => {
      if (!checkoutPurpose.trim()) {
        toast.error("Select a run purpose before starting");
        return;
      }

      const disabledReason = getStartDisabledReason(vehicle);
      if (disabledReason) return;

      setActiveVehicleAction(vehicle);
      try {
        await doStartRun(vehicle, checkoutPurpose);
      } finally {
        setActiveVehicleAction((current) => (current === vehicle ? null : current));
      }
    },
    [doStartRun, getStartDisabledReason]
  );

  const handleCheckoutOther = useCallback(
    async (vehicle: Vehicle, selectedPriority: DeliveryRunPriorityPurpose): Promise<void> => {
      const selectedAction = getPriorityActionSelection(selectedPriority);
      if (selectedAction.createsRun) {
        toast.error("Select Tech Duty or Administrative to check out without starting a run");
        return;
      }

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

        await vehicleCheckoutsApi.checkout({
          vehicle,
          checkout_type: selectedAction.checkoutType,
          purpose: selectedAction.purpose,
        });
        toast.success(`Vehicle checked out for ${selectedAction.purpose}`);
        await refreshStatuses();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
        await refreshStatuses();
      } finally {
        setActiveVehicleAction((current) => (current === vehicle ? null : current));
      }
    },
    [refreshStatuses, statusByVehicle]
  );

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

  const handleViewDetail = (orderId: string) => {
    navigate(`/orders/${orderId}`);
  };

  const selectedVehicleStartBlockedReason = selectedVehicle ? getStartDisabledReason(selectedVehicle.id) : "Select a vehicle";

  const preflightBlockers = useMemo(() => {
    const blockers: Array<{ kind: "error" | "warning"; message: string }> = [];
    if (selectedOrders.size === 0) {
      blockers.push({ kind: "error", message: "Select at least one ready order to dispatch." });
    }
    if (!selectedVehicle) {
      blockers.push({ kind: "error", message: "Select a vehicle." });
    } else if (selectedVehicleStartBlockedReason) {
      blockers.push({ kind: "error", message: selectedVehicleStartBlockedReason });
    }
    if (selectedPartialPickCount > 0) {
      blockers.push({
        kind: "warning",
        message: `${selectedPartialPickCount} selected order${selectedPartialPickCount === 1 ? " is" : "s are"} partially picked.`,
      });
    }
    return blockers;
  }, [selectedOrders.size, selectedVehicle, selectedVehicleStartBlockedReason, selectedPartialPickCount]);

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Pre-Delivery Orders</h2>
            <p className="text-xs text-muted-foreground">Use lanes to triage ready vs exception orders before dispatch.</p>
          </div>

          {loadError ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <span>Failed to refresh delivery orders. {loadError}</span>
              <Button variant="outline" size="sm" onClick={() => void loadOrders()}>
                Retry
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Selected</span>
            <span className="font-semibold text-foreground">{selectedOrders.size}</span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground">Locations</span>
            <span className="font-semibold text-foreground">{selectedLocationCount}</span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground">Partial picks</span>
            <span className="font-semibold text-foreground">{selectedPartialPickCount}</span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground">Ready lane</span>
            <span className="font-semibold text-foreground">{readyOrders.length}</span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground">Needs attention</span>
            <span className="font-semibold text-foreground">{needsAttentionOrders.length}</span>
          </div>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-muted-foreground">Quick selection for currently filtered orders</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search ID, recipient, deliverer, or location"
                    className="h-8 w-[280px] max-w-full"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleVisible}
                    disabled={preDeliveryFilteredOrders.length === 0}
                  >
                    {allVisibleSelected ? "Clear visible" : "Select visible"}
                  </Button>
                </div>
              </div>

              {preDeliveryFilteredOrders.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No pre-delivery orders match this filter</div>
              ) : (
                <div className="space-y-3 xl:max-h-[620px] xl:overflow-y-auto xl:pr-1">
                  <DispatchOrderLane
                    title="Needs Attention"
                    description="Partial picks or exceptions to review before starting a run."
                    orders={needsAttentionOrders}
                    selectedOrderIds={selectedOrders}
                    emptyText="No exception orders in the current filter"
                    onToggleOrder={handleSelectOrder}
                    onViewOrder={handleViewDetail}
                  />
                  <DispatchOrderLane
                    title="Ready to Dispatch"
                    description="Orders that are fully picked and ready for vehicle assignment."
                    orders={readyOrders}
                    selectedOrderIds={selectedOrders}
                    emptyText="No ready orders in the current filter"
                    onToggleOrder={handleSelectOrder}
                    onViewOrder={handleViewDetail}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <div className="px-4 pt-4">
              <h3 className="text-sm font-semibold">Active Delivery Orders</h3>
            </div>
            <CardContent className="space-y-2 p-4">
              {activeDeliveryPreview.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No orders are currently in delivery</div>
              ) : (
                <div className="divide-y divide-border/60">
                  {activeDeliveryPreview.map((order) => (
                    <div key={order.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="-mx-1 inline-flex min-h-8 items-center rounded px-1 text-left text-sm font-medium text-foreground hover:underline"
                          onClick={() => handleViewDetail(order.id)}
                        >
                          {order.inflow_order_id}
                        </button>
                        <Badge variant="secondary" className="shrink-0">
                          {formatRunLabel(order.delivery_run_id)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {order.assigned_deliverer || "Unassigned"} - {formatDeliveryLocation(order) || "Unknown destination"}
                      </div>
                    </div>
                  ))}
                  {inDeliveryOrders.length > activeDeliveryPreview.length ? (
                    <div className="text-xs text-muted-foreground">
                      Showing {activeDeliveryPreview.length} of {inDeliveryOrders.length} in-delivery orders
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Fleet Command</h2>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-1">
            <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Select vehicle">
              {VEHICLES.map((vehicle) => {
                const isActive = vehicle.id === selectedVehicleId;

                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    }`}
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                  >
                    {vehicle.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Exception Queue</div>
                    <div className="text-xs text-muted-foreground">
                      Partial-pick orders that should be reviewed before dispatch.
                    </div>
                  </div>
                  <Badge variant="warning">{needsAttentionOrders.length}</Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectExceptionLane}
                    disabled={needsAttentionOrders.length === 0}
                  >
                    Select exceptions
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearExceptionSelection}
                    disabled={selectedExceptionOrderIds.length === 0}
                  >
                    Clear exception selection
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleMoveExceptionsToIssue()}
                    disabled={selectedExceptionOrderIds.length === 0 || exceptionBulkUpdating}
                  >
                    {exceptionBulkUpdating
                      ? "Moving..."
                      : `Move selected to Issue (${selectedExceptionOrderIds.length})`}
                  </Button>
                </div>

                {needsAttentionOrders.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                    No exception orders in the current queue filter.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {needsAttentionOrders.slice(0, 6).map((order) => (
                      <div
                        key={`exception-${order.id}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-amber-300/40 bg-amber-50/50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-foreground">{order.inflow_order_id || order.id}</div>
                          <div className="truncate text-xs text-muted-foreground">{order.recipient_name || "Unknown recipient"}</div>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleViewDetail(order.id)}>
                          Review
                        </Button>
                      </div>
                    ))}
                    {needsAttentionOrders.length > 6 ? (
                      <div className="text-xs text-muted-foreground">
                        +{needsAttentionOrders.length - 6} more in Needs Attention lane
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="text-sm font-semibold text-foreground">Dispatch Preflight</div>
                <div className="text-xs text-muted-foreground">
                  Vehicle: {selectedVehicle?.label ?? "None selected"} | Selected orders: {selectedOrders.size}
                </div>
                {preflightBlockers.length === 0 ? (
                  <div className="rounded-md border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Ready to start a run when purpose is selected in Fleet Command.
                  </div>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {preflightBlockers.map((blocker) => (
                      <li
                        key={`${blocker.kind}-${blocker.message}`}
                        className={`rounded-md px-3 py-2 ${
                          blocker.kind === "error"
                            ? "border border-destructive/30 bg-destructive/5 text-destructive"
                            : "border border-amber-300/40 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {blocker.message}
                      </li>
                    ))}
                  </ul>
                )}
                {selectedPartialPickCount > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Review partial picks in the Needs Attention lane before continuing.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {selectedVehicle ? (
              <VehicleCommandCard
                key={selectedVehicle.id}
                label={selectedVehicle.label}
                status={statusByVehicle[selectedVehicle.id]}
                isLoading={statusesLoading}
                isActionLoading={activeVehicleAction === selectedVehicle.id}
                onCheckoutOther={(purpose) => handleCheckoutOther(selectedVehicle.id, purpose)}
                onCheckin={() => handleCheckin(selectedVehicle.id)}
                onStartRun={(priorityPurpose) => handleStartRun(selectedVehicle.id, priorityPurpose)}
                startRunDisabledReason={getStartDisabledReason(selectedVehicle.id)}
                isOwnedByCurrentUser={checkedOutByCurrentUser(statusByVehicle[selectedVehicle.id], user)}
              />
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">No vehicles available</div>
            )}
          </div>
        </section>
      </div>

      <Dialog open={partialPickDialogOpen} onOpenChange={handlePartialPickDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Partial Pick Warning
            </DialogTitle>
            <DialogDescription>
              {partialPickOrders.length} order{partialPickOrders.length > 1 ? "s are" : " is"} only partially picked.
              Only the picked items will be delivered. Remainder orders will be created for unpicked items.
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
