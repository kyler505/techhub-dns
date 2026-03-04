
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
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
            toast.error("Failed to load order details.");
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
            toast.error("Please complete all required QA fields before submitting.");
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

            toast.success("QA checklist submitted successfully!");
            navigate("/order-qa"); // Go back to dashboard
        } catch (error) {
            console.error("Failed to submit QA:", error);
            toast.error("Failed to submit QA checklist. Please try again.");
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
        <div className="container mx-auto py-6">
            <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-maroon-900/10 bg-card shadow-lg">
                <div className="bg-gradient-to-br from-maroon-50 via-background to-background p-6 border-b border-maroon-900/10 flex items-start justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-maroon-700">Quality Assurance</div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">QA Checklist</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Order: <span className="font-semibold text-foreground">{order.inflow_order_id}</span>
                        </p>
                        {lastSavedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                Previously submitted: {new Date(lastSavedAt).toLocaleString()}
                            </p>
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    {/* Q1 */}
                    <div>
                        <label className="block text-sm font-medium text-foreground">
                            1. Order Number <span className="text-red-600">*</span>
                        </label>
                        <input
                            value={form.orderNumber}
                            readOnly
                            className="mt-1 w-full rounded-md border border-maroon-900/10 bg-maroon-50/40 px-3 py-2 text-muted-foreground shadow-sm focus:outline-none"
                        />
                    </div>

                    {/* Q2 Removed - Auto Assignment */}
                    <div className="rounded-md border border-maroon-900/15 bg-maroon-50/60 p-4">
                        <p className="flex items-center gap-2 text-sm text-maroon-900">
                            <span className="font-semibold">Info:</span>
                            Technician will be automatically recorded as:
                            <span className="font-mono font-medium">{user?.display_name || user?.email || "Current User"}</span>
                        </p>
                    </div>

                    {/* Q3 - Q8 */}
                    <div className="space-y-4">
                        <p className="border-b border-maroon-900/10 pb-2 font-medium text-foreground">
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
                            <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${item.checked ? 'border-emerald-200 bg-emerald-50' : 'border-maroon-900/10 bg-white hover:border-maroon-900/30'}`}>
                                <input
                                    type="checkbox"
                                    checked={item.checked}
                                    onChange={item.setter}
                                    className="mt-1 h-5 w-5 rounded border-maroon-900/20 text-primary focus:ring-primary"
                                />
                                <span className={`text-sm ${item.checked ? 'font-medium text-emerald-900' : 'text-foreground'}`}>
                                    {item.label}
                                </span>
                            </label>
                        ))}
                    </div>

                    {/* Q9 - Auto Assigned */}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-foreground">
                            9. QA Signature (First and Last Name) <span className="text-red-600">*</span>
                        </label>
                        <div className="w-full rounded-md border border-maroon-900/10 bg-maroon-50/40 px-3 py-2 text-muted-foreground">
                            {user?.display_name || user?.email || "Current User"}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Signature will be automatically recorded upon submission.
                        </p>
                    </div>

                    {/* Q10 */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                            10. Method <span className="text-red-600">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-4 transition-all ${form.method === 'Delivery' ? 'border-primary bg-primary text-white' : 'border-maroon-900/10 bg-white text-foreground hover:border-maroon-900/25'}`}>
                                <input
                                    type="radio"
                                    name="qa-method"
                                    checked={form.method === "Delivery"}
                                    onChange={() => setForm((p) => ({ ...p, method: "Delivery" }))}
                                    className="sr-only"
                                />
                                <span className="font-medium">Delivery</span>
                            </label>

                            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-4 transition-all ${form.method === 'Shipping' ? 'border-primary bg-primary text-white' : 'border-maroon-900/10 bg-white text-foreground hover:border-maroon-900/25'}`}>
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

                <div className="flex items-center justify-between border-t border-maroon-900/10 bg-maroon-50/40 px-6 py-4">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={submitQA}
                        disabled={!isFormComplete(form)}
                        className={`rounded-md px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${isFormComplete(form)
                            ? 'bg-primary hover:bg-primary/90'
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
