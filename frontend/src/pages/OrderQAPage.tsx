
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Order } from "../types/order";
import { ordersApi } from "../api/orders";

type QAMethod = "Delivery" | "Shipping";

type QAFormState = {
    orderNumber: string;
    // technician field removed from UI - handled by backend
    technician: string; // Kept in state for compatibility but not shown in UI
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



const defaultForm = (orderNumber: string): QAFormState => ({
    orderNumber,
    technician: "", // Will be ignored by backend auto-assignment
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
        // Technician check removed as it's auto-assigned
        form.verifyAssetTagSerialMatch &&
        form.verifyOrderDetailsTemplateSent &&
        form.verifyPackagedProperly &&
        form.verifyPackingSlipSerialsMatch &&
        form.verifyElectronicPackingSlipSaved &&
        form.verifyBoxesLabeledCorrectly &&
        // qaSignature checked implicitly via auto-assignment in backend/frontend state
        (form.method === "Delivery" || form.method === "Shipping")
    );
}

export default function OrderQAPage() {
    const navigate = useNavigate();
    const { orderId } = useParams<{ orderId: string }>();
    const { user } = useAuth();

    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<QAFormState>(() => defaultForm(""));
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

    useEffect(() => {
        if (orderId) {
            loadOrder(orderId);
        }
    }, [orderId]);

    const loadOrder = async (id: string) => {
        setLoading(true);
        try {
            const data = await ordersApi.getOrder(id);
            setOrder(data);
            initializeForm(data);
        } catch (error) {
            console.error("Failed to load order:", error);
            alert("Failed to load order details.");
            navigate("/order-qa");
        } finally {
            setLoading(false);
        }
    };

    const initializeForm = (order: Order) => {
        const orderNumber = (order.inflow_order_id || order.id || "").toString();
        const savedRaw = localStorage.getItem(storageKey(order.id));

        if (savedRaw) {
            try {
                const parsed = JSON.parse(savedRaw) as SavedQAChecklist;
                setForm(parsed.form);
                setLastSavedAt(parsed.submittedAt);
            } catch {
                setupDefaults(orderNumber);
            }
        } else {
            setupDefaults(orderNumber);
        }
    };

    const setupDefaults = (orderNumber: string) => {
        const defaults = defaultForm(orderNumber);
        // Auto-fill QA signature with current user if possible
        if (user?.display_name) {
            defaults.qaSignature = user.display_name;
        }
        setForm(defaults);
        setLastSavedAt(null);
    };

    const submitQA = async () => {
        if (!order) return;

        if (!isFormComplete(form)) {
            alert("Please complete all required QA fields before submitting.");
            return;
        }

        try {
            // Submit QA to backend
            // Note: 'technician' is sent as empty string or whatever is in state,
            // but backend will override it with the authenticated user.
            await ordersApi.submitQa(order.id, {
                responses: {
                    ...form,
                    qaSignature: user?.display_name || user?.email || "System", // Force auto-assign signature
                },
                technician: user?.email || "system", // Fallback for types, backend ignores this for auth user
            });

            // Also save locally for UI state (optional history)
            const payload: SavedQAChecklist = {
                orderId: order.id,
                inflowOrderId: order.inflow_order_id || order.id,
                submittedAt: new Date().toISOString(),
                form,
            };
            localStorage.setItem(storageKey(order.id), JSON.stringify(payload));

            alert("QA checklist submitted successfully!");
            navigate("/order-qa"); // Go back to dashboard
        } catch (error) {
            console.error("Failed to submit QA:", error);
            alert("Failed to submit QA checklist. Please try again.");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading order...</div>
            </div>
        );
    }

    if (!order) return null;

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex items-start justify-between bg-white">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">QA Checklist</h1>
                        <p className="text-gray-600 mt-1">
                            Order: <span className="font-semibold text-gray-900">{order.inflow_order_id}</span>
                        </p>
                        {lastSavedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                                Previously submitted: {new Date(lastSavedAt).toLocaleString()}
                            </p>
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    {/* Q1 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            1. Order Number <span className="text-red-600">*</span>
                        </label>
                        <input
                            value={form.orderNumber}
                            readOnly
                            className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 shadow-sm focus:outline-none"
                        />
                    </div>

                    {/* Q2 Removed - Auto Assignment */}
                    <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                        <p className="text-sm text-blue-800 flex items-center gap-2">
                            <span className="font-semibold">Info:</span>
                            Technician will be automatically recorded as:
                            <span className="font-mono font-medium">{user?.display_name || user?.email || "Current User"}</span>
                        </p>
                    </div>

                    {/* Q3 - Q8 */}
                    <div className="space-y-4">
                        <p className="font-medium text-gray-900 border-b pb-2">
                            Verification Steps <span className="text-red-600">*</span>
                        </p>

                        {[
                            {
                                id: 'verifyAssetTagSerialMatch',
                                label: '3. Verify that system asset tag has been applied and that the serial number on the device, sticker and pick list all match.',
                                checked: form.verifyAssetTagSerialMatch,
                                setter: () => setForm((p) => ({ ...p, verifyAssetTagSerialMatch: !p.verifyAssetTagSerialMatch }))
                            },
                            {
                                id: 'verifyOrderDetailsTemplateSent',
                                label: '4. Verify that the order details template has been sent to the customer before completing a delivery.',
                                checked: form.verifyOrderDetailsTemplateSent,
                                setter: () => setForm((p) => ({ ...p, verifyOrderDetailsTemplateSent: !p.verifyOrderDetailsTemplateSent }))
                            },
                            {
                                id: 'verifyPackagedProperly',
                                label: '5. Verify that system and all materials included are packaged properly',
                                checked: form.verifyPackagedProperly,
                                setter: () => setForm((p) => ({ ...p, verifyPackagedProperly: !p.verifyPackagedProperly }))
                            },
                            {
                                id: 'verifyPackingSlipSerialsMatch',
                                label: '6. Verify packing slip and picked items and serial numbers match.',
                                checked: form.verifyPackingSlipSerialsMatch,
                                setter: () => setForm((p) => ({ ...p, verifyPackingSlipSerialsMatch: !p.verifyPackingSlipSerialsMatch }))
                            },
                            {
                                id: 'verifyElectronicPackingSlipSaved',
                                label: '7. Verify there is an electronic packing slip saved on the shipping and receiving computer.',
                                checked: form.verifyElectronicPackingSlipSaved,
                                setter: () => setForm((p) => ({ ...p, verifyElectronicPackingSlipSaved: !p.verifyElectronicPackingSlipSaved }))
                            },
                            {
                                id: 'verifyBoxesLabeledCorrectly',
                                label: '8. Verify boxes are labeled with correct order details and shipping labels are marked out.',
                                checked: form.verifyBoxesLabeledCorrectly,
                                setter: () => setForm((p) => ({ ...p, verifyBoxesLabeledCorrectly: !p.verifyBoxesLabeledCorrectly }))
                            }
                        ].map((item) => (
                            <label key={item.id} className={`flex items-start gap-3 rounded-lg border p-4 transition-colors cursor-pointer ${item.checked ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-[#800000]'}`}>
                                <input
                                    type="checkbox"
                                    checked={item.checked}
                                    onChange={item.setter}
                                    className="mt-1 h-5 w-5 rounded border-gray-300 text-[#800000] focus:ring-[#800000]"
                                />
                                <span className={`text-sm ${item.checked ? 'text-green-900 font-medium' : 'text-gray-700'}`}>
                                    {item.label}
                                </span>
                            </label>
                        ))}
                    </div>

                    {/* Q9 - Auto Assigned */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            9. QA Signature (First and Last Name) <span className="text-red-600">*</span>
                        </label>
                        <div className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">
                            {user?.display_name || user?.email || "Current User"}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Signature will be automatically recorded upon submission.
                        </p>
                    </div>

                    {/* Q10 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            10. Method <span className="text-red-600">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <label className={`flex items-center justify-center gap-2 p-4 rounded-lg border cursor-pointer transition-all ${form.method === 'Delivery' ? 'bg-[#800000] text-white border-[#800000]' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                                <input
                                    type="radio"
                                    name="qa-method"
                                    checked={form.method === "Delivery"}
                                    onChange={() => setForm((p) => ({ ...p, method: "Delivery" }))}
                                    className="sr-only"
                                />
                                <span className="font-medium">Delivery</span>
                            </label>

                            <label className={`flex items-center justify-center gap-2 p-4 rounded-lg border cursor-pointer transition-all ${form.method === 'Shipping' ? 'bg-[#800000] text-white border-[#800000]' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                                <input
                                    type="radio"
                                    name="qa-method"
                                    checked={form.method === "Shipping"}
                                    onChange={() => setForm((p) => ({ ...p, method: "Shipping" }))}
                                    className="sr-only"
                                />
                                <span className="font-medium">Shipping</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={submitQA}
                        disabled={!isFormComplete(form)}
                        className={`rounded-md px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${isFormComplete(form)
                            ? 'bg-[#800000] hover:bg-[#660000]'
                            : 'bg-gray-300 cursor-not-allowed'
                            }`}
                    >
                        Submit QA Checklist
                    </button>
                </div>
            </div>
        </div>
    );
}
