import VehicleCheckoutPanel from "../../components/VehicleCheckoutPanel";
import { useVehicleStatuses } from "../../hooks/useVehicleStatuses";

export default function DeliveryFleetPage() {
  const { statuses, isLoading, refresh } = useVehicleStatuses();

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Fleet</div>
        <div className="text-xs text-muted-foreground">Check vehicles in/out and review status</div>
      </div>
      <VehicleCheckoutPanel statuses={statuses} isLoading={isLoading} refresh={refresh} />
    </div>
  );
}
