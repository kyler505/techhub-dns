import { useEffect, useState } from "react";
import { Order, OrderStatus, ShippingWorkflowStatus, ShippingWorkflowStatusDisplayNames } from "../types/order";
import { ordersApi } from "../api/orders";
import { formatDeliveryLocation } from "../utils/location";

export default function Shipping() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [search, setSearch] = useState("");
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

    useEffect(() => {
        loadOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const loadOrders = async () => {
        setLoadingOrders(true);
        try {
            const data = await ordersApi.getOrders({
                status: OrderStatus.SHIPPING,
                search: search.trim() ? search.trim() : undefined,
            });
            setOrders(data);
        } catch (error) {
            console.error("Failed to load orders:", error);
            alert("Failed to load orders");
        } finally {
            setLoadingOrders(false);
        }
    };

    const updateShippingWorkflow = async (
        orderId: string,
        status: ShippingWorkflowStatus,
        carrierName?: string,
        trackingNumber?: string
    ) => {
        setUpdatingOrderId(orderId);
        try {
            await ordersApi.updateShippingWorkflow(orderId, {
                status,
                carrier_name: carrierName,
                tracking_number: trackingNumber,
                updated_by: "shipping_coordinator" // This should come from auth context in a real app
            });
            await loadOrders(); // Refresh the orders list
        } catch (error) {
            console.error("Failed to update shipping workflow:", error);
            alert("Failed to update shipping status");
        } finally {
            setUpdatingOrderId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <h2 className="text-lg font-semibold">Shipping</h2>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            Search
                            <input
                                className="rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#800000]"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Order ID / recipient / location..."
                            />
                        </label>
                    </div>
                </div>

                {loadingOrders ? (
                    <div className="p-4">Loading...</div>
                ) : (
                    <div className="mt-4 overflow-x-auto ios-scroll">
                        <table className="min-w-[720px] border-collapse border border-gray-200">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="border border-gray-200 px-3 py-2 text-left">Order</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left hidden lg:table-cell">Location / City</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">Dock Status</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">FedEx</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => {
                                    const currentStatus = o.shipping_workflow_status || ShippingWorkflowStatus.WORK_AREA;
                                    const isUpdating = updatingOrderId === o.id;

                                    return (
                                        <tr key={o.id} className="hover:bg-gray-50">
                                            <td className="border border-gray-200 px-3 py-2 font-medium text-gray-900">
                                                {o.inflow_order_id || o.id}
                                            </td>

                                            <td className="border border-gray-200 px-3 py-2 text-gray-800 hidden lg:table-cell">
                                                {formatDeliveryLocation(o)}
                                            </td>

                                            <td className="border border-gray-200 px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${currentStatus === ShippingWorkflowStatus.DOCK ? "bg-blue-100 text-blue-700" :
                                                            currentStatus === ShippingWorkflowStatus.SHIPPED ? "bg-green-100 text-green-700" :
                                                                "bg-gray-100 text-gray-700"
                                                            }`}
                                                    >
                                                        {ShippingWorkflowStatusDisplayNames[currentStatus]}
                                                    </span>

                                                    {currentStatus === ShippingWorkflowStatus.WORK_AREA && (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateShippingWorkflow(o.id, ShippingWorkflowStatus.DOCK)}
                                                            disabled={isUpdating}
                                                            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {isUpdating ? "Moving..." : "Move to Dock"}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="border border-gray-200 px-3 py-2">
                                                <div className="flex flex-col gap-2">
                                                    {currentStatus === ShippingWorkflowStatus.DOCK && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const carrier = prompt("Carrier name (FedEx, UPS, etc.):");
                                                                if (carrier) {
                                                                    updateShippingWorkflow(o.id, ShippingWorkflowStatus.SHIPPED, carrier);
                                                                }
                                                            }}
                                                            disabled={isUpdating}
                                                            className="w-fit rounded-md bg-[#800000] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#660000] disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {isUpdating ? "Shipping..." : "Mark as Shipped"}
                                                        </button>
                                                    )}

                                                    {currentStatus === ShippingWorkflowStatus.SHIPPED && o.carrier_name && (
                                                        <div className="text-xs text-gray-600">
                                                            <div>Shipped to: {o.carrier_name}</div>
                                                            {o.tracking_number && <div>Tracking: {o.tracking_number}</div>}
                                                            {o.shipped_to_carrier_at && (
                                                                <div>At: {new Date(o.shipped_to_carrier_at).toLocaleString()}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {!orders.length && (
                                    <tr>
                                        <td className="border border-gray-200 px-4 py-6 text-center text-gray-600" colSpan={4}>
                                            No orders found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
