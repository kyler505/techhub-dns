import { useDeliveryRuns } from "../hooks/useDeliveryRuns";
import { Link } from "react-router-dom";

export default function LiveDeliveryDashboard() {
    const { runs, loading, error } = useDeliveryRuns();

    return (
        <div className="p-4">
            {error && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-sm text-gray-600">Loading delivery runs...</div>
            ) : runs.length === 0 ? (
                <div className="text-sm text-gray-600">No active delivery runs</div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {runs.map((r) => (
                        <Link key={r.id} to={`/delivery/runs/${r.id}`}>
                            <div className="border p-3 rounded hover:bg-gray-50 cursor-pointer transition-colors bg-white">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="text-sm text-gray-500">Run</div>
                                        <div className="font-medium">{r.name}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-gray-500">Vehicle</div>
                                        <div className="font-medium capitalize">{r.vehicle.replace('_', ' ')}</div>
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
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
