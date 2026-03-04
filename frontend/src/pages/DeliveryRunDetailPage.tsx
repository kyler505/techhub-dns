import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, CheckCircle, Clock, Package, Truck, User } from "lucide-react";

import { deliveryRunsApi } from "../api/deliveryRuns";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useDeliveryRun } from "../hooks/useDeliveryRun";
import { OrderStatus } from "../types/order";

type DeliveryDetailLocationState = {
  from?: string;
};

function formatVehicleName(vehicle: string): string {
  return vehicle
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "Not started";
  return new Date(dateString).toLocaleString();
}

function getRunStatusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return "success" as const;
    case "completed":
      return "secondary" as const;
    case "cancelled":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function getOrderStatusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "pre_delivery":
      return "warning" as const;
    case "in_delivery":
      return "secondary" as const;
    case "delivered":
      return "success" as const;
    case "issue":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function getApiErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const candidate = error as {
      response?: {
        data?: {
          error?: {
            message?: unknown;
          };
        };
      };
    };
    const message = candidate.response?.data?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Failed to complete delivery. Ensure all orders are delivered first.";
}

export default function DeliveryRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { run, loading, error, refetch } = useDeliveryRun(runId);
  const [finishing, setFinishing] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const locationState = location.state as DeliveryDetailLocationState | null;
  const backTo = locationState?.from ?? "/delivery/dispatch";

  const allOrdersDelivered =
    run?.orders.every((order) => order.status.toLowerCase() === "delivered") ?? false;
  const runIsActive = run?.status.toLowerCase() === "active";

  const handleCompleteRun = async () => {
    if (!run || !allOrdersDelivered) return;

    setFinishing(true);
    try {
      await deliveryRunsApi.finishRun(run.id);
      toast.success("Delivery run completed");
      await refetch();
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error));
      setErrorDialogOpen(true);
    } finally {
      setFinishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading delivery run details...</div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-destructive">{error || "Delivery run not found"}</div>
        <Button variant="outline" onClick={() => navigate(backTo)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Delivery
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(backTo)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{run.name}</h2>
            <p className="text-sm text-muted-foreground">Run ID: {run.id}</p>
          </div>
        </div>

        {runIsActive ? (
          <Button
            onClick={handleCompleteRun}
            disabled={!allOrdersDelivered || finishing}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {finishing ? "Completing..." : "Complete Delivery"}
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Run Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Runner</div>
                <div className="font-medium">{run.runner}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Vehicle</div>
                <div className="font-medium">{formatVehicleName(run.vehicle)}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-current text-xs text-muted-foreground">
                *
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge variant={getRunStatusVariant(run.status)}>{run.status.toLowerCase()}</Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Orders</div>
                <div className="font-medium">{run.orders.length}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 border-t pt-6 md:grid-cols-2">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Started</div>
                <div className="font-medium">{formatDateTime(run.start_time)}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Completed</div>
                <div className="font-medium">{formatDateTime(run.end_time)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders in This Run</CardTitle>
          <CardDescription>
            {run.orders.length} order{run.orders.length !== 1 ? "s" : ""} assigned to this delivery run
          </CardDescription>
        </CardHeader>
        <CardContent>
          {run.orders.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No orders assigned to this run</div>
          ) : (
            <div className="space-y-3">
              {run.orders.map((order) => (
                <div
                  key={order.id}
                  className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${order.status.toLowerCase() !== "delivered" ? "border-accent/20 bg-accent/5" : "hover:bg-muted/50"}`}
                >
                  <div>
                    <div className="font-medium">Order {order.inflow_order_id || order.id.slice(0, 8)}</div>
                    {order.recipient_name ? (
                      <div className="text-sm text-muted-foreground">{order.recipient_name}</div>
                    ) : null}
                    {order.delivery_location ? (
                      <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        <span className="font-medium">Location:</span> {order.delivery_location}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge variant={getOrderStatusVariant(order.status)}>
                      {order.status.toLowerCase().replace("_", " ")}
                    </Badge>

                    {order.status.toLowerCase() !== "delivered" ? (
                      <span className="text-xs font-medium text-accent">Must be signed first</span>
                    ) : null}

                    <Link to={`/orders/${order.id}`}>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </Link>

                    {order.status === OrderStatus.IN_DELIVERY ? (
                      <Link to={`/document-signing?orderId=${order.id}&returnTo=/delivery/runs/${run.id}`}>
                        <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                          Sign Document
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Cannot Complete Delivery
            </DialogTitle>
            <DialogDescription className="pt-2">{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorDialogOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
