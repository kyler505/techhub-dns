import { useDeliveryRuns } from "../hooks/useDeliveryRuns";

export default function LiveDeliveryDashboard() {
  const { runs } = useDeliveryRuns();

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-lg font-semibold mb-4">Live Delivery Dashboard</h2>

      {runs.length === 0 ? (
        <div className="text-sm text-gray-600">No active delivery runs</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {runs.map((r) => (
            <div key={r.id} className="border p-3 rounded">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-gray-500">Run</div>
                  <div className="font-medium">{r.id}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Vehicle</div>
                  <div className="font-medium">{r.vehicle}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-gray-700">
                <div>
                  <div className="text-xs text-gray-500">Runner</div>
                  <div>{r.runner}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Status</div>
                  <div>{r.status}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Orders</div>
                  <div>{r.order_ids.length}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
