import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import { isValidOrderId } from "../utils/orderIds";

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

    const openOrder = (orderId?: string) => {
        if (!isValidOrderId(orderId)) {
            toast.error("Order details are unavailable for this row");
            return;
        }
        navigate(`/orders/${orderId}`);
    };

    const openQa = (orderId?: string) => {
        if (!isValidOrderId(orderId)) {
            toast.error("QA form is unavailable for this row");
            return;
        }
        navigate(`/orders/${orderId}/qa`);
    };

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
            <header className="mb-4">
                <h1 className="text-2xl font-bold text-gray-900">QA Checklist Dashboard</h1>
                <p className="text-sm text-muted-foreground">Monitor orders awaiting QA review.</p>
            </header>

            <section className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Orders Needing QA</h2>
                        <p className="text-xs text-muted-foreground">Filtered to QA status orders only.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                        <label htmlFor="qa-checklist-search" className="sr-only">Search QA orders</label>
                        <input
                            id="qa-checklist-search"
                            name="qaChecklistSearch"
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search orders"
                            aria-label="Search orders needing QA"
                        />
                    </div>
                </div>

                {loadingOrders ? (
                    <div className="p-4">Loading...</div>
                ) : (
                    <div className="mt-4 overflow-x-auto ios-scroll rounded-lg border border-border bg-card shadow-sm">
                        <table className="min-w-[640px] w-full md:min-w-[720px]">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipient</th>
                                    <th className="hidden px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Location</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">QA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/70">
                                {orders
                                    .filter((o) => !completedMap.has(o.id))
                                    .filter((o) => {
                                        return ![OrderStatus.DELIVERED, OrderStatus.IN_DELIVERY, OrderStatus.SHIPPING].includes(o.status);
                                    })
                                    .map((o) => {
                                        const submittedAt = completedMap.get(o.id) || null;
                                        const qaButtonLabel = submittedAt ? "Edit QA" : "Perform QA"; // clearer label

                                        return (
                                        <tr key={o.id} className="transition-colors hover:bg-muted/30">
                                            <td className="px-3 py-2 text-sm text-foreground">
                                                <button
                                                    type="button"
                                                    onClick={() => openOrder(o.id)}
                                                    className="rounded-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                >
                                                    {o.inflow_order_id}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2 text-sm text-foreground">{o.recipient_name || "N/A"}</td>
                                            <td className="hidden px-3 py-2 text-sm text-foreground lg:table-cell">{o.delivery_location || "N/A"}</td>
                                            <td className="px-3 py-2 text-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => openQa(o.id)}
                                                    className="flex min-h-[44px] items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                                            <td className="px-3 py-6 text-center text-sm text-muted-foreground" colSpan={4}>
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
