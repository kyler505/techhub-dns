import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { deliveryRunsApi, type DeliveryRunResponse } from "../../api/deliveryRuns";
import {
  vehicleCheckoutsApi,
  type ListVehicleCheckoutsResponse,
  type Vehicle,
} from "../../api/vehicleCheckouts";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

const VEHICLES: Vehicle[] = ["van", "golf_cart"];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

function formatVehicleLabel(vehicle: Vehicle): string {
  return vehicle === "golf_cart" ? "Golf Cart" : "Van";
}

function getRunStatusVariant(status: string): "success" | "destructive" | "secondary" {
  switch (status.toLowerCase()) {
    case "completed":
      return "success";
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
}

export default function DeliveryFleetHistoryPage() {
  const params = useParams();
  const vehicle = params.vehicle as Vehicle | undefined;

  const [checkouts, setCheckouts] = useState<ListVehicleCheckoutsResponse | null>(null);
  const [runs, setRuns] = useState<DeliveryRunResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const validVehicle = useMemo(() => (vehicle && VEHICLES.includes(vehicle) ? vehicle : null), [vehicle]);

  useEffect(() => {
    if (!validVehicle) return;

    const load = async () => {
      setLoading(true);
      try {
        const [checkoutHistory, deliveryRuns] = await Promise.all([
          vehicleCheckoutsApi.listCheckouts({ vehicle: validVehicle, page: 1, page_size: 50 }),
          deliveryRunsApi.getRuns({ vehicle: validVehicle }),
        ]);
        setCheckouts(checkoutHistory);
        setRuns(deliveryRuns);
      } catch (error) {
        toast.error("Failed to load fleet history");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [validVehicle]);

  if (!validVehicle) {
    return <Navigate to="/delivery/fleet" replace />;
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading history...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold">{formatVehicleLabel(validVehicle)} History</div>
          <div className="text-xs text-muted-foreground">Checkout activity and completed/active run timeline</div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/delivery/fleet">Back to Fleet</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Checkout records</div>
            <div className="text-xl font-semibold">{checkouts?.items.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Delivery runs</div>
            <div className="text-xl font-semibold">{runs.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">Vehicle Checkout History</div>
        {!checkouts || checkouts.items.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No checkout history found</div>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Checked Out</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Checked In</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Purpose</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Checked Out By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkouts.items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{formatDateTime(c.checked_out_at)}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(c.checked_in_at)}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant={c.checkout_type === "other" ? "secondary" : "default"}>
                          {c.checkout_type === "other" ? "Other" : "Delivery run"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{c.purpose || "-"}</TableCell>
                      <TableCell className="text-sm">{c.checked_out_by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">Delivery Run History</div>
        {runs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No delivery runs found</div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <Card key={run.id} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{run.name || `Run ${run.id.slice(0, 8)}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(run.end_time || run.start_time)} - Runner: {run.runner}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getRunStatusVariant(run.status)}>
                      {run.status}
                    </Badge>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/delivery/runs/${run.id}`} state={{ from: `/delivery/fleet/${validVehicle}/history` }}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
