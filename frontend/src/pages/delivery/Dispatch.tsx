import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { deliveryRunsApi } from "../../api/deliveryRuns";
import { ordersApi } from "../../api/orders";
import { type Vehicle, type VehicleStatusItem, vehicleCheckoutsApi } from "../../api/vehicleCheckouts";
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

type BacklogFilter = "all" | "queue" | "prep";

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

function classifyBacklog(order: Order): "queue" | "prep" {
  if (order.pick_status?.is_fully_picked) return "queue";
  return "prep";
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
  const [backlogFilter, setBacklogFilter] = useState<BacklogFilter>("all");
  const [stagingVehicle, setStagingVehicle] = useState<Vehicle>("van");
  const [isStarting, setIsStarting] = useState(false);

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

  const queueOrders = useMemo(
    () => preDeliveryOrders.filter((order) => classifyBacklog(order) === "queue"),
    [preDeliveryOrders]
  );

  const prepOrders = useMemo(
    () => preDeliveryOrders.filter((order) => classifyBacklog(order) === "prep"),
    [preDeliveryOrders]
  );

  const visibleBacklogOrders = useMemo(() => {
    if (backlogFilter === "queue") return queueOrders;
    if (backlogFilter === "prep") return prepOrders;
    return preDeliveryOrders;
  }, [backlogFilter, preDeliveryOrders, queueOrders, prepOrders]);

  const activeRunCount = useMemo(() => {
    const runIds = new Set<string>();
    for (const order of inDeliveryOrders) {
      const runId = order.delivery_run_id?.trim();
      if (runId) runIds.add(runId);
    }
    return runIds.size;
  }, [inDeliveryOrders]);

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
    visibleBacklogOrders.length > 0 && visibleBacklogOrders.every((order) => selectedOrders.has(order.id));

  const readyRatio = preDeliveryOrders.length > 0 ? Math.round((queueOrders.length / preDeliveryOrders.length) * 100) : 0;

  const destinationSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of selectedOrdersList) {
      const location = formatDeliveryLocation(order) || "Unknown destination";
      counts.set(location, (counts.get(location) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [selectedOrdersList]);

  const selectedPartialPickCount = useMemo(
    () => selectedOrdersList.filter((order) => order.pick_status && !order.pick_status.is_fully_picked).length,
    [selectedOrdersList]
  );

  const stagingVehicleStatus = statusByVehicle[stagingVehicle];
  const startDisabledReason = useMemo((): string | null => {
    if (selectedOrders.size === 0) return "Select orders from backlog";
    if (statusesLoading) return "Vehicle status is loading";

    if (stagingVehicleStatus.delivery_run_active) {
      return "Vehicle already has an active run";
    }

    if (stagingVehicleStatus.checked_out) {
      if (stagingVehicleStatus.checkout_type === "other") {
        const purpose = stagingVehicleStatus.purpose?.trim();
        const suffix = purpose ? ` (purpose: ${purpose})` : "";
        return `Checked out for Other${suffix}. Check in, then check out again for a Delivery run.`;
      }

      if (!checkedOutByCurrentUser(stagingVehicleStatus, user)) {
        const who = stagingVehicleStatus.checked_out_by;
        return who ? `Checked out by ${who}` : "Checked out by another user";
      }
    }

    return null;
  }, [selectedOrders.size, stagingVehicleStatus, statusesLoading, user]);

  const handleToggleVisible = () => {
    if (allVisibleSelected) {
      setSelectedOrders((previous) => {
        const next = new Set(previous);
        for (const order of visibleBacklogOrders) {
          next.delete(order.id);
        }
        return next;
      });
      return;
    }

    setSelectedOrders((previous) => {
      const next = new Set(previous);
      for (const order of visibleBacklogOrders) {
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

  const handleStartRun = async () => {
    if (startDisabledReason) return;
    setIsStarting(true);
    try {
      await doStartRun(stagingVehicle);
    } finally {
      setIsStarting(false);
    }
  };

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
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Backlog</CardDescription>
            <CardTitle className="text-xl">{preDeliveryOrders.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Prep plus queue orders ready for dispatch</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Staging</CardDescription>
            <CardTitle className="text-xl">{selectedOrders.size}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Orders selected for next run</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Runs</CardDescription>
            <CardTitle className="text-xl">{activeRunCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{inDeliveryOrders.length} orders currently in delivery</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Backlog</h2>
            <p className="text-xs text-muted-foreground">Split between queue-ready and prep-hold orders.</p>
          </div>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Ready workload</div>
                <div className="text-xs font-medium">{queueOrders.length} / {preDeliveryOrders.length} queue-ready</div>
              </div>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div className="h-full bg-accent" style={{ width: `${readyRatio}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={backlogFilter === "all" ? "default" : "outline"}
                  onClick={() => setBacklogFilter("all")}
                >
                  All ({preDeliveryOrders.length})
                </Button>
                <Button
                  size="sm"
                  variant={backlogFilter === "queue" ? "default" : "outline"}
                  onClick={() => setBacklogFilter("queue")}
                >
                  Queue ({queueOrders.length})
                </Button>
                <Button
                  size="sm"
                  variant={backlogFilter === "prep" ? "default" : "outline"}
                  onClick={() => setBacklogFilter("prep")}
                >
                  Prep ({prepOrders.length})
                </Button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Quick selection</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleVisible}
                  disabled={visibleBacklogOrders.length === 0}
                >
                  {allVisibleSelected ? "Clear visible" : "Select visible"}
                </Button>
              </div>

              {visibleBacklogOrders.length === 0 ? (
                <div className="rounded border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  No orders in this backlog segment
                </div>
              ) : (
                <div className="space-y-2 xl:max-h-[520px] xl:overflow-y-auto xl:pr-1">
                  {visibleBacklogOrders.map((order) => {
                    const segment = classifyBacklog(order);
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
                          <Badge variant={segment === "queue" ? "success" : "secondary"}>
                            {segment === "queue" ? "Queue" : "Prep"}
                          </Badge>
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

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top destinations</div>
                {destinationSummary.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No selected destinations</div>
                ) : (
                  <div className="space-y-2">
                    {destinationSummary.map((item) => (
                      <div key={item.location} className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm">
                        <span className="truncate">{item.location}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <label htmlFor="dispatch-staging-vehicle" className="text-sm font-medium">
                  Vehicle for next run
                </label>
                <select
                  id="dispatch-staging-vehicle"
                  value={stagingVehicle}
                  onChange={(event) => setStagingVehicle(event.target.value as Vehicle)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={isStarting}
                >
                  <option value="van">Van</option>
                  <option value="golf_cart">Golf Cart</option>
                </select>
              </div>

              <div className="space-y-2">
                <Button onClick={handleStartRun} disabled={Boolean(startDisabledReason) || isStarting} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  {isStarting ? "Starting..." : `Start Run (${selectedOrders.size})`}
                </Button>
                {startDisabledReason ? <div className="text-xs text-muted-foreground">{startDisabledReason}</div> : null}
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
            <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Priority legend</div>
              <div>P1 Delivery: critical dispatch use, do not interrupt.</div>
              <div>P2 Tech Duty: high priority service or support work.</div>
              <div>P3 Administrative: low priority other usage, recallable when needed.</div>
            </CardContent>
          </Card>

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
