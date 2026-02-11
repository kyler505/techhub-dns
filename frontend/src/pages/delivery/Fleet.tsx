import VehicleCheckoutPanel from "../../components/VehicleCheckoutPanel";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { useVehicleStatuses } from "../../hooks/useVehicleStatuses";

export default function DeliveryFleetPage() {
  const { statuses, isLoading, refresh } = useVehicleStatuses();
  const availableCount = statuses.filter((status) => !status.checked_out).length;
  const checkedOutCount = statuses.filter((status) => status.checked_out).length;
  const activeRunCount = statuses.filter((status) => status.delivery_run_active).length;
  const otherUseCount = statuses.filter(
    (status) => status.checked_out && status.checkout_type === "other"
  ).length;

  const formatCount = (value: number): string => (isLoading ? "--" : String(value));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="text-base font-semibold">Fleet</div>
        <div className="text-xs text-muted-foreground">
          Manage vehicle availability and non-delivery checkouts.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Available vehicles</div>
            <div className="text-xl font-semibold">{formatCount(availableCount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Checked out vehicles</div>
            <div className="text-xl font-semibold">{formatCount(checkedOutCount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Active delivery runs</div>
            <div className="text-xl font-semibold">{formatCount(activeRunCount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Other-use checkouts</div>
            <div className="text-xl font-semibold">{formatCount(otherUseCount)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Quick links</div>
            <div className="text-xs text-muted-foreground">Review recent checkout history by vehicle.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/delivery/fleet/van/history">Van history</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/delivery/fleet/golf_cart/history">Golf cart history</Link>
            </Button>
          </div>
          </CardContent>
        </Card>

      <VehicleCheckoutPanel statuses={statuses} isLoading={isLoading} refresh={refresh} />
    </div>
  );
}
