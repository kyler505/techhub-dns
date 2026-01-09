import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";

type QAMethod = "Delivery" | "Shipping";

type QAFormState = {
    orderNumber: string;
    technician: string;
    verifyAssetTagSerialMatch: boolean; // Q3
    verifyOrderDetailsTemplateSent: boolean; // Q4
    verifyPackagedProperly: boolean; // Q5
    verifyPackingSlipSerialsMatch: boolean; // Q6
    verifyElectronicPackingSlipSaved: boolean; // Q7
    verifyBoxesLabeledCorrectly: boolean; // Q8
    qaSignature: string; // Q9
    method: QAMethod | ""; // Q10
};

type SavedQAChecklist = {
    orderId: string; // internal id
    inflowOrderId: string; // display id
    submittedAt: string; // ISO
    form: QAFormState;
};

const TECHNICIANS = [
    "Joshua Pullum",
    "Aaron Pizzitola",
    "Stormy Brewer",
    "Lilly Tran",
    "Jevin Joy",
    "Kyler Cao",
];

const defaultForm = (orderNumber: string): QAFormState => ({
    orderNumber,
    technician: "",
    verifyAssetTagSerialMatch: false,
    verifyOrderDetailsTemplateSent: false,
    verifyPackagedProperly: false,
    verifyPackingSlipSerialsMatch: false,
    verifyElectronicPackingSlipSaved: false,
    verifyBoxesLabeledCorrectly: false,
    qaSignature: "",
    method: "",
});

const storageKey = (orderId: string) => `order-qa-checklist-v2:${orderId}`;

function isFormComplete(form: QAFormState) {
    return (
        form.orderNumber.trim().length > 0 &&
        form.technician.trim().length > 0 &&
        form.verifyAssetTagSerialMatch &&
        form.verifyOrderDetailsTemplateSent &&
        form.verifyPackagedProperly &&
        form.verifyPackingSlipSerialsMatch &&
        form.verifyElectronicPackingSlipSaved &&
        form.verifyBoxesLabeledCorrectly &&
        form.qaSignature.trim().length > 0 &&
        (form.method === "Delivery" || form.method === "Shipping")
    );
}

export default function OrderQAChecklist() {
    const navigate = useNavigate();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [search, setSearch] = useState("");
    const [showCompleted, setShowCompleted] = useState(false);

    // QA modal state
    const [qaOpen, setQaOpen] = useState(false);
    const [activeOrder, setActiveOrder] = useState<Order | null>(null);
    const [form, setForm] = useState<QAFormState>(() => defaultForm(""));
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

    useEffect(() => {
        loadOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, showCompleted]);

    const loadOrders = async () => {
        setLoadingOrders(true);
        try {
            // Only load orders that are in Picked status (eligible for QA)
            // or all orders if showCompleted is true
            const statusFilter = showCompleted ? undefined : OrderStatus.PICKED;
            const data = await ordersApi.getOrders({
                status: statusFilter,
                search: search.trim() ? search.trim() : undefined,
            });
            // Filter to only show orders that have picklist generated (required for QA)
            const filteredData = showCompleted ? data : data.filter(order => order.picklist_generated_at);
            setOrders(filteredData);
        } catch (error) {
            console.error("Failed to load orders:", error);
            alert("Failed to load orders");
        } finally {
            setLoadingOrders(false);
        }
    };

    const openQA = (order: Order) => {
        setActiveOrder(order);

        const orderNumber = (order.inflow_order_id || order.id || "").toString();

        const savedRaw = localStorage.getItem(storageKey(order.id));
        if (savedRaw) {
            try {
                const parsed = JSON.parse(savedRaw) as SavedQAChecklist;
                setForm(parsed.form);
                setLastSavedAt(parsed.submittedAt);
            } catch {
                setForm(defaultForm(orderNumber));
                setLastSavedAt(null);
            }
        } else {
            setForm(defaultForm(orderNumber));
            setLastSavedAt(null);
        }

        setQaOpen(true);
    };

    const closeQA = () => {
        setQaOpen(false);
        setActiveOrder(null);
        setLastSavedAt(null);
        setForm(defaultForm(""));
    };

    const submitQA = async () => {
        if (!activeOrder) return;

        if (!isFormComplete(form)) {
            alert("Please complete all required QA fields before submitting.");
            return;
        }

        try {
            // Submit QA to backend
            await ordersApi.submitQa(activeOrder.id, {
                responses: form,
                technician: form.technician,
            });

            // Also save locally for UI state (optional)
            const payload: SavedQAChecklist = {
                orderId: activeOrder.id,
                inflowOrderId: activeOrder.inflow_order_id || activeOrder.id,
                submittedAt: new Date().toISOString(),
                form,
            };
            localStorage.setItem(storageKey(activeOrder.id), JSON.stringify(payload));
            setLastSavedAt(payload.submittedAt);

            alert("QA checklist submitted successfully!");
            closeQA();
            loadOrders();
        } catch (error) {
            console.error("Failed to submit QA:", error);
            alert("Failed to submit QA checklist. Please try again.");
        }
    };

    const completedMap = useMemo(() => {
        const map = new Map<string, string>(); // orderId -> submittedAt
        for (const o of orders) {
            // Check backend QA completion first
            if (o.qa_completed_at) {
                map.set(o.id, o.qa_completed_at);
            } else {
                // Fallback to localStorage for backwards compatibility
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
            <h1 className="text-2xl font-bold text-gray-900 mb-4">QA Checklist</h1>

            <section className="bg-white shadow rounded-lg p-4 border border-gray-100 mb-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            {showCompleted ? "All Orders" : "Orders Needing QA"}
                        </h2>
                    </div>

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

                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <input
                                type="checkbox"
                                checked={showCompleted}
                                onChange={(e) => setShowCompleted(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                            />
                            Show all orders
                        </label>
                    </div>
                </div>

                {loadingOrders ? (
                    <div className="p-4">Loading...</div>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full border-collapse border border-gray-200">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="border border-gray-200 px-4 py-2 text-left">Order</th>
                                    <th className="border border-gray-200 px-4 py-2 text-left">Recipient</th>
                                    <th className="border border-gray-200 px-4 py-2 text-left">Location</th>
                                    <th className="border border-gray-200 px-4 py-2 text-left">QA</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders
                                    .filter((o) => showCompleted || !completedMap.has(o.id))
                                    .filter((o) => {
                                        // Only show orders that are eligible for QA (not already delivered/shipped)
                                        return ![OrderStatus.DELIVERED, OrderStatus.IN_DELIVERY, OrderStatus.SHIPPING].includes(o.status);
                                    })
                                    .map((o) => {
                                        const submittedAt = completedMap.get(o.id) || null;
                                        const qaButtonLabel = submittedAt ? "Edit QA" : "QA";

                                        return (
                                            <tr key={o.id} className="hover:bg-gray-50">
                                                <td className="border border-gray-200 px-4 py-2">
                                                    <button
                                                        onClick={() => navigate(`/orders/${o.id}`)}
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {o.inflow_order_id}
                                                    </button>
                                                </td>
                                                <td className="border border-gray-200 px-4 py-2">{o.recipient_name || "N/A"}</td>
                                                <td className="border border-gray-200 px-4 py-2">{o.delivery_location || "N/A"}</td>
                                                <td className="border border-gray-200 px-4 py-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openQA(o)}
                                                        className="px-3 py-1.5 text-sm bg-[#800000] text-white rounded hover:bg-[#660000]"
                                                    >
                                                        {qaButtonLabel}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                {orders
                                    .filter((o) => showCompleted || !completedMap.has(o.id))
                                    .filter((o) => ![OrderStatus.DELIVERED, OrderStatus.IN_DELIVERY, OrderStatus.SHIPPING].includes(o.status))
                                    .length === 0 && (
                                        <tr>
                                            <td className="border border-gray-200 px-4 py-6 text-center text-gray-600" colSpan={4}>
                                                {orders.length === 0
                                                    ? showCompleted
                                                        ? "No orders found."
                                                        : "No orders need QA at this time."
                                                    : showCompleted
                                                        ? "No eligible orders found."
                                                        : "All eligible orders have completed QA."}
                                            </td>
                                        </tr>
                                    )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* QA modal */}
            {qaOpen && activeOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={closeQA} />

                    <div className="relative w-[min(900px,95vw)] max-h-[90vh] overflow-auto bg-white rounded-lg shadow-lg border border-gray-200">
                        <div className="p-4 border-b border-gray-200 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">QA Checklist</h2>
                                <p className="text-sm text-gray-600">
                                    Order: <span className="font-semibold">{activeOrder.inflow_order_id}</span>
                                </p>
                                {lastSavedAt && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Previously submitted: {new Date(lastSavedAt).toLocaleString()}
                                    </p>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={closeQA}
                                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="p-4 space-y-6">
                            {/* Q1 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    1. Order Number <span className="text-red-600">*</span>
                                </label>
                                <input
                                    value={form.orderNumber}
                                    onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))}
                                    className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#800000]"
                                />
                            </div>

                            {/* Q2 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    2. Technician (On order checklist) <span className="text-red-600">*</span>
                                </label>
                                <select
                                    value={form.technician}
                                    onChange={(e) => setForm((p) => ({ ...p, technician: e.target.value }))}
                                    className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#800000]"
                                >
                                    <option value="">Select technician</option>
                                    {TECHNICIANS.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Q3 - Q8 */}
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-gray-700">
                                    3–8. Verify each item <span className="text-red-600">*</span>
                                </p>

                                <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-[#800000]">
                                    <input
                                        type="checkbox"
                                        checked={form.verifyAssetTagSerialMatch}
                                        onChange={() =>
                                            setForm((p) => ({ ...p, verifyAssetTagSerialMatch: !p.verifyAssetTagSerialMatch }))
                                        }
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                                    />
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            3. Verify that system asset tag has been applied and that the serial number on the device, sticker
                                            and pick list all match.
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-[#800000]">
                                    <input
                                        type="checkbox"
                                        checked={form.verifyOrderDetailsTemplateSent}
                                        onChange={() =>
                                            setForm((p) => ({
                                                ...p,
                                                verifyOrderDetailsTemplateSent: !p.verifyOrderDetailsTemplateSent,
                                            }))
                                        }
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                                    />
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            4. Verify that the order details template has been sent to the customer before completing a
                                            delivery.
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-[#800000]">
                                    <input
                                        type="checkbox"
                                        checked={form.verifyPackagedProperly}
                                        onChange={() => setForm((p) => ({ ...p, verifyPackagedProperly: !p.verifyPackagedProperly }))}
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                                    />
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            5. Verify that system and all materials included are packaged properly
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-[#800000]">
                                    <input
                                        type="checkbox"
                                        checked={form.verifyPackingSlipSerialsMatch}
                                        onChange={() =>
                                            setForm((p) => ({ ...p, verifyPackingSlipSerialsMatch: !p.verifyPackingSlipSerialsMatch }))
                                        }
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                                    />
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            6. Verify packing slip and picked items and serial numbers match.
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-[#800000]">
                                    <input
                                        type="checkbox"
                                        checked={form.verifyElectronicPackingSlipSaved}
                                        onChange={() =>
                                            setForm((p) => ({
                                                ...p,
                                                verifyElectronicPackingSlipSaved: !p.verifyElectronicPackingSlipSaved,
                                            }))
                                        }
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                                    />
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            7. Verify there is an electronic packing slip saved on the shipping and receiving computer.
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-[#800000]">
                                    <input
                                        type="checkbox"
                                        checked={form.verifyBoxesLabeledCorrectly}
                                        onChange={() =>
                                            setForm((p) => ({ ...p, verifyBoxesLabeledCorrectly: !p.verifyBoxesLabeledCorrectly }))
                                        }
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                                    />
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            8. Verify boxes are labeled with correct order details and shipping labels are marked out.
                                        </p>
                                    </div>
                                </label>
                            </div>

                            {/* Q9 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    9. QA Signature (First and Last Name) <span className="text-red-600">*</span>
                                </label>
                                <select
                                    value={form.qaSignature}
                                    onChange={(e) => setForm((p) => ({ ...p, qaSignature: e.target.value }))}
                                    className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#800000]"
                                >
                                    <option value="">Select signature</option>
                                    {TECHNICIANS.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Q10 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    10. Method <span className="text-red-600">*</span>
                                </label>
                                <div className="mt-2 flex flex-col gap-2">
                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="qa-method"
                                            checked={form.method === "Delivery"}
                                            onChange={() => setForm((p) => ({ ...p, method: "Delivery" }))}
                                            className="h-4 w-4 text-[#800000] focus:ring-[#800000]"
                                        />
                                        <span className="text-sm text-gray-800">Delivery</span>
                                    </label>

                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="qa-method"
                                            checked={form.method === "Shipping"}
                                            onChange={() => setForm((p) => ({ ...p, method: "Shipping" }))}
                                            className="h-4 w-4 text-[#800000] focus:ring-[#800000]"
                                        />
                                        <span className="text-sm text-gray-800">Shipping</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3">
                            <div className="text-sm text-gray-600">
                                {isFormComplete(form) ? (
                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                                        Ready to submit
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                                        Incomplete
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={closeQA}
                                    className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={submitQA}
                                    className="rounded-md bg-[#800000] px-4 py-2 text-sm font-semibold text-white hover:bg-[#660000]"
                                >
                                    Submit QA
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
