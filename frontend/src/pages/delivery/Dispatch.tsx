import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { deliveryRunsApi, type DeliveryRunResponse } from "../../api/deliveryRuns";
import { ordersApi } from "../../api/orders";
import {
  type ListVehicleCheckoutsResponse,
  type Vehicle,
  type VehicleStatusItem,
  vehicleCheckoutsApi,
} from "../../api/vehicleCheckouts";
import VehicleCommandCard from "../../components/delivery/VehicleCommandCard";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useAuth } from "../../contexts/AuthContext";
import { useOrdersWebSocket } from "../../hooks/useOrdersWebSocket";
import { useVehicleStatuses } from "../../hooks/useVehicleStatuses";
import type { User } from "../../contexts/AuthContext";
import type { Order } from "../../types/order";
import { OrderStatus } from "../../types/order";
import { formatDeliveryLocation } from "../../utils/location";

type VehicleDescriptor = {
  id: Vehicle;
  label: string;
};

type VehicleHistoryData = {
  checkouts: ListVehicleCheckoutsResponse["items"];
  runs: DeliveryRunResponse[];
};

type BooleanByVehicle = Record<Vehicle, boolean>;

type HistoryByVehicle = Record<Vehicle, VehicleHistoryData | null>;

function createVehicleBooleanMap(defaultValue: boolean): BooleanByVehicle {
  return { van: defaultValue, golf_cart: defaultValue };
}

function createVehicleHistoryMap(): HistoryByVehicle {
  return { van: null, golf_cart: null };
}

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
  const [actionLoadingByVehicle, setActionLoadingByVehicle] = useState<BooleanByVehicle>(() =>
    createVehicleBooleanMap(false)
  );
  const [historyOpenByVehicle, setHistoryOpenByVehicle] = useState<BooleanByVehicle>(() =>
    createVehicleBooleanMap(false)
  );
  const [historyLoadingByVehicle, setHistoryLoadingByVehicle] = useState<BooleanByVehicle>(() =>
    createVehicleBooleanMap(false)
  );
  const [historyDataByVehicle, setHistoryDataByVehicle] = useState<HistoryByVehicle>(() =>
    createVehicleHistoryMap()
  );

  const [partialPickDialogOpen, setPartialPickDialogOpen] = useState(false);
  const [partialPickOrders, setPartialPickOrders] = useState<Order[]>([]);
  const [pendingStartVehicle, setPendingStartVehicle] = useState<Vehicle | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [pre, inDelivery] = await Promise.all([
        ordersApi.getOrders({ status: OrderStatus.PRE_DELIVERY }),
        ordersApi.getOrders({ status: OrderStatus.IN_DELIVERY }),
      ]);
      setPreDeliveryOrders(pre);
      setInDeliveryOrders(inDelivery);
    } catch {
      toast.error("Failed to load delivery orders");
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
    preDeliveryOrders.length > 0 && preDeliveryOrders.every((order) => selectedOrders.has(order.id));

  const selectedPartialPickCount = useMemo(
    () => selectedOrdersList.filter((order) => order.pick_status && !order.pick_status.is_fully_picked).length,
    [selectedOrdersList]
  );

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
        for (const order of preDeliveryOrders) {
          next.delete(order.id);
        }
        return next;
      });
      return;
    }

    setSelectedOrders((previous) => {
      const next = new Set(previous);
      for (const order of preDeliveryOrders) {
        next.add(order.id);
      }
      return next;
    });
  };

  const loadVehicleHistory = useCallback(async (vehicle: Vehicle) => {
    setHistoryLoadingByVehicle((previous) => ({ ...previous, [vehicle]: true }));
    try {
      const [checkoutsResponse, runsResponse] = await Promise.all([
        vehicleCheckoutsApi.listCheckouts({ vehicle, page: 1, page_size: 5 }),
        deliveryRunsApi.getRuns({ vehicle }),
      ]);

      const sortedRuns = [...runsResponse].sort((left, right) => {
        const leftTime = Date.parse(left.end_time ?? left.start_time ?? "");
        const rightTime = Date.parse(right.end_time ?? right.start_time ?? "");
        const safeLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
        const safeRightTime = Number.isNaN(rightTime) ? 0 : rightTime;
        return safeRightTime - safeLeftTime;
      });

      const sortedCheckouts = [...checkoutsResponse.items].sort((left, right) => {
        const leftTime = Date.parse(left.checked_out_at ?? "");
        const rightTime = Date.parse(right.checked_out_at ?? "");
        const safeLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
        const safeRightTime = Number.isNaN(rightTime) ? 0 : rightTime;
        return safeRightTime - safeLeftTime;
      });

      setHistoryDataByVehicle((previous) => ({
        ...previous,
        [vehicle]: {
          checkouts: sortedCheckouts.slice(0, 5),
          runs: sortedRuns.slice(0, 5),
        },
      }));
    } catch {
      toast.error("Failed to load vehicle history");
    } finally {
      setHistoryLoadingByVehicle((previous) => ({ ...previous, [vehicle]: false }));
    }
  }, []);

  const handleToggleVehicleHistory = useCallback(
    async (vehicle: Vehicle) => {
      const nextOpen = !historyOpenByVehicle[vehicle];
      setHistoryOpenByVehicle((previous) => ({ ...previous, [vehicle]: nextOpen }));
      if (!nextOpen || historyLoadingByVehicle[vehicle] || historyDataByVehicle[vehicle]) {
        return;
      }
      await loadVehicleHistory(vehicle);
    },
    [historyDataByVehicle, historyLoadingByVehicle, historyOpenByVehicle, loadVehicleHistory]
  );

  const invalidateVehicleHistory = useCallback((vehicle: Vehicle) => {
    setHistoryDataByVehicle((previous) => ({ ...previous, [vehicle]: null }));
  }, []);

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
        await vehicleCheckoutsApi.checkout({ vehicle, checkout_type: "delivery_run" });
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

  const handleStartRunForVehicle = async (vehicle: Vehicle) => {
    const disabledReason = getStartDisabledReason(vehicle);
    if (disabledReason) return;

    setActionLoadingByVehicle((previous) => ({ ...previous, [vehicle]: true }));
    try {
      await doStartRun(vehicle);
      invalidateVehicleHistory(vehicle);
    } finally {
      setActionLoadingByVehicle((previous) => ({ ...previous, [vehicle]: false }));
    }
  };

  const handleCheckoutOther = useCallback(
    async (vehicle: Vehicle, purpose: string): Promise<boolean> => {
      const trimmedPurpose = purpose.trim();
      if (!trimmedPurpose) {
        toast.error("Purpose is required");
        return false;
      }

      setActionLoadingByVehicle((previous) => ({ ...previous, [vehicle]: true }));
      try {
        await vehicleCheckoutsApi.checkout({
          vehicle,
          checkout_type: "other",
          purpose: trimmedPurpose,
        });
        toast.success("Vehicle checked out");
        invalidateVehicleHistory(vehicle);
        await refreshStatuses();
        return true;
      } catch (error) {
        toast.error(getApiErrorMessage(error));
        await refreshStatuses();
        return false;
      } finally {
        setActionLoadingByVehicle((previous) => ({ ...previous, [vehicle]: false }));
      }
    },
    [invalidateVehicleHistory, refreshStatuses]
  );

  const handleCheckin = useCallback(
    async (vehicle: Vehicle): Promise<void> => {
      setActionLoadingByVehicle((previous) => ({ ...previous, [vehicle]: true }));
      try {
        await vehicleCheckoutsApi.checkin({ vehicle });
        toast.success("Vehicle checked in");
        invalidateVehicleHistory(vehicle);
        await refreshStatuses();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
        await refreshStatuses();
      } finally {
        setActionLoadingByVehicle((previous) => ({ ...previous, [vehicle]: false }));
      }
    },
    [invalidateVehicleHistory, refreshStatuses]
  );

  const handlePartialPickConfirm = async () => {
    setPartialPickDialogOpen(false);
    const vehicle = pendingStartVehicle;
    setPendingStartVehicle(null);
    if (!vehicle) return;
    await doStartRun(vehicle, { skipPartialPickConfirm: true });
  };

  const handleViewDetail = (orderId: string) => {
    navigate(`/orders/${orderId}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Pre-Delivery Orders</h2>
            <p className="text-xs text-muted-foreground">Select orders to stage the next delivery run.</p>
          </div>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Quick selection</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleVisible}
                  disabled={preDeliveryOrders.length === 0}
                >
                  {allVisibleSelected ? "Clear all" : "Select all"}
                </Button>
              </div>

              {preDeliveryOrders.length === 0 ? (
                <div className="rounded border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  No pre-delivery orders
                </div>
              ) : (
                <div className="space-y-2 xl:max-h-[520px] xl:overflow-y-auto xl:pr-1">
                  {preDeliveryOrders.map((order) => {
                    const isSelected = selectedOrders.has(order.id);

                    return (
                      <div key={order.id} className="rounded border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <button
                              type="button"
                              className="-mx-2 inline-flex min-h-9 items-center rounded px-2 text-left text-sm font-medium text-foreground hover:underline"
                              onClick={() => handleViewDetail(order.id)}
                            >
                              {order.inflow_order_id}
                            </button>
                            <div className="text-xs text-muted-foreground">{order.recipient_name || "N/A"}</div>
                            <div className="text-xs text-muted-foreground">{formatDeliveryLocation(order)}</div>
                          </div>
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleSelectOrder(order.id)}
                            aria-label={`Select order ${order.inflow_order_id ?? order.id}`}
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Deliverer: {order.assigned_deliverer || "Unassigned"}</span>
                          {order.pick_status && !order.pick_status.is_fully_picked ? (
                            <Badge
                              variant="warning"
                              className="gap-1"
                              title={`Partial pick: ${order.pick_status.total_picked}/${order.pick_status.total_ordered} items picked`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Partial Pick
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Run Staging</h2>
            <p className="text-xs text-muted-foreground">Review selected orders and create the next run.</p>
          </div>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Selected orders</div>
                  <div className="text-lg font-semibold">{selectedOrders.size}</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Partial-pick risk</div>
                  <div className="text-lg font-semibold">{selectedPartialPickCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Fleet Status</h2>
            <p className="text-xs text-muted-foreground">Operational priority and dispatchability by vehicle.</p>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active Delivery Orders</CardTitle>
              <CardDescription>Current run and order visibility</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {activeDeliveryPreview.length === 0 ? (
                <div className="rounded border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  No orders are currently in delivery
                </div>
              ) : (
                <div className="space-y-2">
                  {activeDeliveryPreview.map((order) => (
                    <div key={order.id} className="rounded border border-border p-2">
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

          <div className="space-y-2">
            {VEHICLES.map((vehicle) => (
              <VehicleCommandCard
                key={vehicle.id}
                label={vehicle.label}
                status={statusByVehicle[vehicle.id]}
                isLoading={statusesLoading}
                isActionLoading={actionLoadingByVehicle[vehicle.id]}
                onCheckoutOther={(purpose) => handleCheckoutOther(vehicle.id, purpose)}
                onCheckin={() => handleCheckin(vehicle.id)}
                onStartRun={() => handleStartRunForVehicle(vehicle.id)}
                startRunDisabledReason={getStartDisabledReason(vehicle.id)}
                historyOpen={historyOpenByVehicle[vehicle.id]}
                historyLoading={historyLoadingByVehicle[vehicle.id]}
                historyCheckouts={historyDataByVehicle[vehicle.id]?.checkouts ?? []}
                historyRuns={historyDataByVehicle[vehicle.id]?.runs ?? []}
                onToggleHistory={() => void handleToggleVehicleHistory(vehicle.id)}
              />
            ))}
          </div>
        </section>
      </div>

      <Dialog open={partialPickDialogOpen} onOpenChange={setPartialPickDialogOpen}>
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
                  <span className="font-medium">{order.inflow_order_id}</span>
                  <span className="text-muted-foreground">
                    {order.pick_status?.total_picked}/{order.pick_status?.total_ordered} items
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartialPickDialogOpen(false)}>
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
