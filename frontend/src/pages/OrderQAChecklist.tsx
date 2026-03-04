import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";

type SavedQAChecklist = {
    orderId: string; // internal id
    inflowOrderId: string; // display id
    submittedAt: string; // ISO
    // Form data structure used only for timestamp retrieval in list view
    form: {
        technician: string;
        qaSignature: string;
        method: string;
    };
};

const storageKey = (orderId: string) => `order-qa-checklist-v2:${orderId}`;

export default function OrderQAChecklist() {
    const navigate = useNavigate();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        loadOrders();
    }, [search]);

    const loadOrders = async () => {
        setLoadingOrders(true);
        try {
            const data = await ordersApi.getOrders({
                status: OrderStatus.QA,
                search: search.trim() ? search.trim() : undefined,
            });
            setOrders(data);
        } catch (error) {
            console.error("Failed to load orders:", error);
            toast.error("Failed to load orders");
        } finally {
            setLoadingOrders(false);
        }
    };

    const completedMap = useMemo(() => {
        const map = new Map<string, string>(); // orderId -> submittedAt
        for (const o of orders) {
            if (o.qa_completed_at) {
                map.set(o.id, o.qa_completed_at);
            } else {
                const raw = localStorage.getItem(storageKey(o.id));
                if (!raw) continue;
                try {
                    const parsed = JSON.parse(raw) as SavedQAChecklist;
                    map.set(o.id, parsed.submittedAt);
                } catch {
                    // ignore
                }
            }
        }
        return map;
    }, [orders]);

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">QA Checklist Dashboard</h1>

            <section className="bg-white shadow rounded-lg p-4 border border-gray-100 mb-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            Orders Needing QA
                        </h2>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                        <div className="flex items-center gap-2">
                            <input
                                className="rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#800000]"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search orders"
                                aria-label="Search"
                            />
                        </div>
                    </div>
                </div>

                {loadingOrders ? (
                    <div className="p-4">Loading...</div>
                ) : (
                    <div className="mt-4 overflow-x-auto ios-scroll rounded-lg border border-slate-200 bg-white shadow-premium">
                        <table className="min-w-[720px] w-full">
                            <thead className="bg-slate-50/80">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Order</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Recipient</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Location</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">QA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orders
                                    .filter((o) => !completedMap.has(o.id))
                                    .filter((o) => {
                                        return ![OrderStatus.DELIVERED, OrderStatus.IN_DELIVERY, OrderStatus.SHIPPING].includes(o.status);
                                    })
                                    .map((o) => {
                                        const submittedAt = completedMap.get(o.id) || null;
                                        const qaButtonLabel = submittedAt ? "Edit QA" : "Perform QA"; // clearer label

                                        return (
                                        <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-3 py-2 text-sm text-slate-700">
                                                <button
                                                    onClick={() => navigate(`/orders/${o.id}`)}
                                                    className="text-slate-700 hover:text-slate-900 hover:underline"
                                                >
                                                    {o.inflow_order_id}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2 text-sm text-slate-700">{o.recipient_name || "N/A"}</td>
                                            <td className="px-3 py-2 text-sm text-slate-700 hidden lg:table-cell">{o.delivery_location || "N/A"}</td>
                                            <td className="px-3 py-2 text-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/orders/${o.id}/qa`)}
                                                    className="px-3 py-1.5 text-sm bg-[#800000] text-white rounded hover:bg-[#660000] flex items-center gap-2 btn-lift"
                                                >
                                                    {qaButtonLabel}
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {orders
                                    .filter((o) => !completedMap.has(o.id))
                                    .filter((o) => ![OrderStatus.DELIVERED, OrderStatus.IN_DELIVERY, OrderStatus.SHIPPING].includes(o.status))
                                    .length === 0 && (
                                        <tr>
                                            <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={4}>
                                                {orders.length === 0
                                                    ? "No orders need QA at this time."
                                                    : "All eligible orders have completed QA."}
                                            </td>
                                        </tr>
                                    )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}


/* file saving information for back end
type SavedQAChecklist = {
  orderId: string;
  inflowOrderId: string;
  submittedAt: string; // ISO timestamp
  form: {
    orderNumber: string;
    technician: string;
    verifyAssetTagSerialMatch: boolean;
    verifyOrderDetailsTemplateSent: boolean;
    verifyPackagedProperly: boolean;
    verifyPackingSlipSerialsMatch: boolean;
    verifyElectronicPackingSlipSaved: boolean;
    verifyBoxesLabeledCorrectly: boolean;
    qaSignature: string;
    method: "Delivery" | "Shipping";
  };
};
*/
