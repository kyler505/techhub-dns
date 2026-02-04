import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Order } from "../types/order";
import { ordersApi } from "../api/orders";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../components/ui/card";

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
    const [submitError, setSubmitError] = useState<string | null>(null);

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
            toast.error("Failed to load order details", {
                description: "Returning to QA dashboard.",
            });
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
            const message = "Please complete all required QA fields before submitting.";
            setSubmitError(message);
            toast.error(message);
            return;
        }

        try {
            setSubmitError(null);
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

            toast.success("QA checklist submitted");
            navigate("/order-qa"); // Go back to dashboard
        } catch (error) {
            console.error("Failed to submit QA:", error);
            toast.error("Failed to submit QA checklist", {
                description: "Please try again.",
            });
        }
    };

    const verificationItems = [
        {
            label: "3. Verify that system asset tag has been applied and that the serial number on the device, sticker and pick list all match.",
            checked: form.verifyAssetTagSerialMatch,
            toggle: () =>
                setForm((p) => ({
                    ...p,
                    verifyAssetTagSerialMatch: !p.verifyAssetTagSerialMatch,
                })),
        },
        {
            label: "4. Verify that the order details template has been sent to the customer before completing a delivery.",
            checked: form.verifyOrderDetailsTemplateSent,
            toggle: () =>
                setForm((p) => ({
                    ...p,
                    verifyOrderDetailsTemplateSent:
                        !p.verifyOrderDetailsTemplateSent,
                })),
        },
        {
            label: "5. Verify that system and all materials included are packaged properly",
            checked: form.verifyPackagedProperly,
            toggle: () =>
                setForm((p) => ({
                    ...p,
                    verifyPackagedProperly: !p.verifyPackagedProperly,
                })),
        },
        {
            label: "6. Verify packing slip and picked items and serial numbers match.",
            checked: form.verifyPackingSlipSerialsMatch,
            toggle: () =>
                setForm((p) => ({
                    ...p,
                    verifyPackingSlipSerialsMatch:
                        !p.verifyPackingSlipSerialsMatch,
                })),
        },
        {
            label: "7. Verify there is an electronic packing slip saved on the shipping and receiving computer.",
            checked: form.verifyElectronicPackingSlipSaved,
            toggle: () =>
                setForm((p) => ({
                    ...p,
                    verifyElectronicPackingSlipSaved:
                        !p.verifyElectronicPackingSlipSaved,
                })),
        },
        {
            label: "8. Verify boxes are labeled with correct order details and shipping labels are marked out.",
            checked: form.verifyBoxesLabeledCorrectly,
            toggle: () =>
                setForm((p) => ({
                    ...p,
                    verifyBoxesLabeledCorrectly:
                        !p.verifyBoxesLabeledCorrectly,
                })),
        },
    ];

    const handleToggle = (toggle: () => void) => {
        if (submitError) setSubmitError(null);
        toggle();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="text-sm text-muted-foreground">Loading order...</div>
            </div>
        );
    }

    if (!order) return null;

    return (
        <div className="mx-auto max-w-3xl">
            <Card className="overflow-hidden">
                <CardHeader className="border-b border-border bg-card/60">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <CardTitle className="text-xl">QA Checklist</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Order:{" "}
                                <span className="font-semibold text-foreground">
                                    {order.inflow_order_id}
                                </span>
                            </p>
                            {lastSavedAt && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Previously submitted:{" "}
                                    {new Date(lastSavedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-8 pt-6">
                    {submitError && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                            {submitError}
                        </div>
                    )}

                    {/* Q1 */}
                    <div>
                        <label className="block text-sm font-medium text-foreground">
                            1. Order Number{" "}
                            <span className="text-destructive">*</span>
                        </label>
                        <Input
                            value={form.orderNumber}
                            readOnly
                            className="mt-1 bg-muted/30 text-muted-foreground"
                        />
                    </div>

                    {/* Q2 Removed - Auto Assignment */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">
                                Info:
                            </span>{" "}
                            Technician will be automatically recorded as{" "}
                            <span className="font-mono font-medium text-foreground">
                                {user?.display_name || user?.email || "Current User"}
                            </span>
                        </p>
                    </div>

                    {/* Q3 - Q8 */}
                    <div className="space-y-4">
                        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
                            <p className="text-sm font-semibold text-foreground">
                                Verification Steps{" "}
                                <span className="text-destructive">*</span>
                            </p>
                        </div>

                        {verificationItems.map((item) => (
                            <label
                                key={item.label}
                                className={cn(
                                    "block rounded-lg border p-4 transition-colors cursor-pointer",
                                    item.checked
                                        ? "border-success/40 bg-success/10"
                                        : "border-border bg-card hover:border-accent/40"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        checked={item.checked}
                                        onChange={() => handleToggle(item.toggle)}
                                        className="mt-1"
                                    />
                                    <span
                                        className={cn(
                                            "text-sm leading-relaxed",
                                            item.checked
                                                ? "text-foreground font-medium"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {item.label}
                                    </span>
                                </div>
                            </label>
                        ))}
                    </div>

                    {/* Q9 - Auto Assigned */}
                    <div>
                        <label className="block text-sm font-medium text-foreground">
                            9. QA Signature (First and Last Name){" "}
                            <span className="text-destructive">*</span>
                        </label>
                        <Input
                            className="mt-1 bg-muted/30 text-muted-foreground"
                            value={
                                user?.display_name || user?.email || "Current User"
                            }
                            readOnly
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Signature will be automatically recorded upon submission.
                        </p>
                    </div>

                    {/* Q10 */}
                    <div>
                        <label className="block text-sm font-medium text-foreground">
                            10. Method <span className="text-destructive">*</span>
                        </label>
                        <div
                            className="mt-2 grid grid-cols-2 gap-3"
                            role="radiogroup"
                            aria-label="QA method"
                        >
                            <Button
                                type="button"
                                variant={
                                    form.method === "Delivery"
                                        ? "default"
                                        : "outline"
                                }
                                aria-pressed={form.method === "Delivery"}
                                onClick={() => {
                                    setSubmitError(null);
                                    setForm((p) => ({ ...p, method: "Delivery" }));
                                }}
                                className={cn(
                                    "w-full justify-center",
                                    form.method === "Delivery" &&
                                        "bg-accent text-accent-foreground hover:bg-accent/90 btn-lift"
                                )}
                            >
                                Delivery
                            </Button>

                            <Button
                                type="button"
                                variant={
                                    form.method === "Shipping"
                                        ? "default"
                                        : "outline"
                                }
                                aria-pressed={form.method === "Shipping"}
                                onClick={() => {
                                    setSubmitError(null);
                                    setForm((p) => ({ ...p, method: "Shipping" }));
                                }}
                                className={cn(
                                    "w-full justify-center",
                                    form.method === "Shipping" &&
                                        "bg-accent text-accent-foreground hover:bg-accent/90 btn-lift"
                                )}
                            >
                                Shipping
                            </Button>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="border-t border-border bg-muted/20 justify-between">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => navigate(-1)}
                    >
                        Cancel
                    </Button>

                    <Button
                        type="button"
                        onClick={submitQA}
                        disabled={!isFormComplete(form)}
                        className="bg-accent text-accent-foreground hover:bg-accent/90 btn-lift"
                    >
                        Submit QA Checklist
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
