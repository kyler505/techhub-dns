import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { deliveryRunsApi } from "../../api/deliveryRuns";
import { ordersApi } from "../../api/orders";
import { type Vehicle, vehicleCheckoutsApi } from "../../api/vehicleCheckouts";
import DeliveryPrepCard from "../../components/delivery/DeliveryPrepCard";
import OrderTable from "../../components/OrderTable";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { useAuth } from "../../contexts/AuthContext";
import { useOrdersWebSocket } from "../../hooks/useOrdersWebSocket";
import { useVehicleStatuses } from "../../hooks/useVehicleStatuses";
import type { Order } from "../../types/order";
import { OrderStatus } from "../../types/order";
import { formatDeliveryLocation } from "../../utils/location";

function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return "Request failed";
  const message = error.response?.data?.error?.message;
  if (typeof message === "string" && message.trim()) return message;
  return "Request failed";
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

  const allPreDeliverySelected =
    preDeliveryOrders.length > 0 && selectedOrders.size === preDeliveryOrders.length;

  const handleToggleAll = () => {
    if (allPreDeliverySelected) {
      setSelectedOrders(new Set());
      return;
    }
    setSelectedOrders(new Set(preDeliveryOrders.map((order) => order.id)));
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
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prep</CardDescription>
            <CardTitle className="text-xl">{selectedOrders.size}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Orders selected for next run</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Queue</CardDescription>
            <CardTitle className="text-xl">{preDeliveryOrders.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Orders ready to dispatch</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Delivery</CardDescription>
            <CardTitle className="text-xl">{inDeliveryOrders.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Orders currently on active runs</CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">1. Prepare dispatch run</h2>
          <p className="text-xs text-muted-foreground">Select a vehicle and confirm checkout readiness before start.</p>
        </div>
        <DeliveryPrepCard
          selectedOrdersCount={selectedOrders.size}
          user={user}
          statusByVehicle={statusByVehicle}
          statusesLoading={statusesLoading}
          onStartRun={doStartRun}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">2. Build run queue</h2>
              <p className="text-xs text-muted-foreground">Choose pre-delivery orders to include in the next run.</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleToggleAll} disabled={preDeliveryOrders.length === 0}>
              {allPreDeliverySelected ? "Clear all" : "Select all"}
            </Button>
          </div>

          {preDeliveryOrders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No orders in pre-delivery queue
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="lg:hidden">
                  <div className="space-y-2 p-3">
                    {preDeliveryOrders.map((order) => (
                      <div key={order.id} className="rounded-md border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => handleViewDetail(order.id)}
                              className="h-auto p-0 font-medium text-foreground"
                            >
                              {order.inflow_order_id}
                            </Button>
                            <div className="text-xs text-muted-foreground">{order.recipient_name || "N/A"}</div>
                            <div className="text-xs text-muted-foreground">{formatDeliveryLocation(order)}</div>
                          </div>
                          <Checkbox
                            checked={selectedOrders.has(order.id)}
                            onChange={() => handleSelectOrder(order.id)}
                            aria-label={`Select order ${order.inflow_order_id ?? order.id}`}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>Deliverer: {order.assigned_deliverer || "Unassigned"}</span>
                          {order.pick_status && !order.pick_status.is_fully_picked ? (
                            <Badge
                              variant="warning"
                              className="gap-1"
                              title={`Partial pick: ${order.pick_status.total_picked}/${order.pick_status.total_ordered} items picked`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Partial
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden lg:block">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allPreDeliverySelected}
                            onChange={handleToggleAll}
                            aria-label="Select all orders"
                          />
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Order ID</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Recipient</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Location</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Deliverer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preDeliveryOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onChange={() => handleSelectOrder(order.id)}
                              aria-label={`Select order ${order.inflow_order_id ?? order.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => handleViewDetail(order.id)}
                                className="h-auto p-0 font-normal text-foreground"
                              >
                                {order.inflow_order_id}
                              </Button>
                              {order.pick_status && !order.pick_status.is_fully_picked ? (
                                <Badge
                                  variant="warning"
                                  className="gap-1"
                                  title={`Partial pick: ${order.pick_status.total_picked}/${order.pick_status.total_ordered} items picked`}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Partial
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{order.recipient_name || "N/A"}</TableCell>
                          <TableCell className="text-sm">{formatDeliveryLocation(order)}</TableCell>
                          <TableCell className="text-sm">{order.assigned_deliverer || "Unassigned"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">3. Monitor active deliveries</h2>
            <p className="text-xs text-muted-foreground">Track all orders currently assigned to active runs.</p>
          </div>
          {inDeliveryOrders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No orders currently in delivery
              </CardContent>
            </Card>
          ) : (
            <OrderTable orders={inDeliveryOrders} onViewDetail={handleViewDetail} />
          )}
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
              {partialPickOrders.length} order{partialPickOrders.length > 1 ? "s are" : " is"} only partially
              picked. Only the picked items will be delivered. Remainder orders will be created for unpicked
              items.
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
