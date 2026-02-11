import VehicleCheckoutPanel from "../../components/VehicleCheckoutPanel";
import { Card, CardContent } from "../../components/ui/card";
import { useVehicleStatuses } from "../../hooks/useVehicleStatuses";

export default function DeliveryFleetPage() {
  const { statuses, isLoading, refresh } = useVehicleStatuses();
  const activeRunCount = statuses.filter((status) => status.delivery_run_active).length;
  const checkedOutCount = statuses.filter((status) => status.checked_out).length;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="text-base font-semibold">Fleet Operations</div>
        <div className="text-xs text-muted-foreground">
          Manage vehicle check-in/check-out for non-delivery use. Start delivery runs from Dispatch.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Checked out vehicles</div>
            <div className="text-xl font-semibold">{checkedOutCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">Active delivery runs</div>
            <div className="text-xl font-semibold">{activeRunCount}</div>
          </CardContent>
        </Card>
      </div>

      <VehicleCheckoutPanel statuses={statuses} isLoading={isLoading} refresh={refresh} />
    </div>
  );
}
