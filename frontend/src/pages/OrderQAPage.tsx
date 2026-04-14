import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { ordersApi } from "../api/orders";
import { getOrderDetailQueryOptions, invalidateOrderQueries } from "../queries/orders";
import type { OrderDetail } from "../types/order";
import { formatToCentralTime } from "../utils/timezone";

type QAMethod = "Delivery" | "Shipping";

type QAFormState = {
    orderNumber: string;
    technician: string;
    verifyAssetTagSerialMatch: boolean;
    verifyOrderDetailsTemplateSent: boolean;
    verifyPackagedProperly: boolean;
    verifyPackingSlipSerialsMatch: boolean;
    verifyElectronicPackingSlipSaved: boolean;
    verifyBoxesLabeledCorrectly: boolean;
    qaSignature: string;
    method: QAMethod | "";
};

type SavedQAChecklist = {
    orderId: string;
    inflowOrderId: string;
    submittedAt: string;
    form: QAFormState;
};

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

const verificationSteps = [
    {
        id: "verifyAssetTagSerialMatch",
        label:
            "3. Verify that system asset tag has been applied and that the serial number on the device, sticker and pick list all match.",
    },
    {
        id: "verifyOrderDetailsTemplateSent",
        label:
            "4. Verify that the order details template has been sent to the customer before completing a delivery.",
    },
    {
        id: "verifyPackagedProperly",
        label: "5. Verify that system and all materials included are packaged properly",
    },
    {
        id: "verifyPackingSlipSerialsMatch",
        label: "6. Verify packing slip and picked items and serial numbers match.",
    },
    {
        id: "verifyElectronicPackingSlipSaved",
        label:
            "7. Verify there is an electronic packing slip saved on the shipping and receiving computer.",
    },
    {
        id: "verifyBoxesLabeledCorrectly",
        label: "8. Verify boxes are labeled with correct order details and shipping labels are marked out.",
    },
];

function isFormComplete(form: QAFormState) {
    return (
        form.orderNumber.trim().length > 0 &&
        form.verifyAssetTagSerialMatch &&
        form.verifyOrderDetailsTemplateSent &&
        form.verifyPackagedProperly &&
        form.verifyPackingSlipSerialsMatch &&
        form.verifyElectronicPackingSlipSaved &&
        form.verifyBoxesLabeledCorrectly &&
        (form.method === "Delivery" || form.method === "Shipping")
    );
}

export default function OrderQAPage() {
    const navigate = useNavigate();
    const { orderId } = useParams<{ orderId: string }>();
    const { user } = useAuth();

    const [form, setForm] = useState<QAFormState>(() => defaultForm(""));
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const orderQuery = useQuery({
        ...getOrderDetailQueryOptions(orderId ?? ""),
        enabled: Boolean(orderId),
        retry: false,
    });

    const order = orderQuery.data ?? null;
    const loading = orderQuery.isPending;

    useEffect(() => {
        if (order) {
            initializeForm(order);
        }
    }, [order]);

    useEffect(() => {
        if (orderQuery.isError) {
            console.error("Failed to load order:", orderQuery.error);
            toast.error("Failed to load order details.");
            navigate("/order-qa");
        }
    }, [navigate, orderQuery.error, orderQuery.isError]);

    const initializeForm = (order: OrderDetail) => {
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
        if (user?.display_name) {
            defaults.qaSignature = user.display_name;
        }
        setForm(defaults);
        setLastSavedAt(null);
    };

    const submitQaMutation = useMutation({
        mutationFn: (payload: { responses: Record<string, unknown>; technician: string; expected_updated_at?: string }) => {
            if (!order) {
                throw new Error("Order is unavailable");
            }

            return ordersApi.submitQa(order.id, payload);
        },
        onSuccess: async () => {
            if (orderId) {
                await invalidateOrderQueries(queryClient, orderId);
            }
        },
        onError: async (error: unknown) => {
            console.error("Failed to submit QA:", error);
            if (error?.response?.status === 409 && orderId) {
                toast.error("Order changed by another user. Reloaded the latest details.");
                await invalidateOrderQueries(queryClient, orderId);
                return;
            }

            toast.error("Failed to submit QA checklist. Please try again.");
        },
    });

    const submitQA = async () => {
        if (!order) return;

        if (!isFormComplete(form)) {
            toast.error("Please complete all required QA fields before submitting.");
            return;
        }

        try {
            await submitQaMutation.mutateAsync({
                responses: {
                    ...form,
                    qaSignature: user?.display_name || user?.email || "System",
                },
                technician: user?.email || "system",
                expected_updated_at: order.updated_at,
            });

            const payload: SavedQAChecklist = {
                orderId: order.id,
                inflowOrderId: order.inflow_order_id || order.id,
                submittedAt: new Date().toISOString(),
                form,
            };
            localStorage.setItem(storageKey(order.id), JSON.stringify(payload));

            toast.success("QA checklist submitted successfully!");
            navigate("/order-qa");
        } catch {
            // Handled by mutation callbacks.
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

    const hasIncompleteSteps = verificationSteps.some((step) => !form[step.id as keyof QAFormState]);

    return (
        <div className="bg-background min-h-screen px-4 py-8">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="space-y-1 text-foreground">
                    <h1 className="text-3xl font-semibold">QA Checklist</h1>
                    <p className="text-sm text-muted-foreground">
                        Complete the checklist for <span className="font-semibold text-foreground">{order.inflow_order_id}</span> before submission.
                    </p>
                    {lastSavedAt && (
                        <p className="text-xs text-muted-foreground">Previously submitted: {formatToCentralTime(lastSavedAt)}</p>
                    )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                    <div className="space-y-6 p-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                1. Order Number <span className="text-red-600">*</span>
                            </label>
                            <input
                                id="qa-order-number"
                                name="orderNumber"
                                value={form.orderNumber}
                                readOnly
                                className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/70"
                            />
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm text-foreground">
                            Technician recorded as <span className="font-semibold text-accent">{user?.display_name || user?.email || "Current User"}</span> on submission.
                        </div>

                        <div className="space-y-4">
                            <div className="border-b border-border pb-2">
                                <p className="text-sm font-medium text-foreground">Verification Steps <span className="text-destructive">*</span></p>
                                <p className="text-xs text-muted-foreground">All steps must be checked before submission.</p>
                            </div>
                            <div className="space-y-3">
                                {verificationSteps.map((step) => {
                                    const checked = form[step.id as keyof QAFormState] as boolean;
                                    return (
                                        <label
                                            key={step.id}
                                            className={`flex gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                                                checked
                                                    ? "border-green-200 bg-green-50 text-green-900"
                                                    : "border-border bg-card hover:border-accent"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                id={step.id}
                                                checked={checked}
                                                onChange={() => setForm((prev) => ({ ...prev, [step.id]: !checked }))}
                                                className="mt-1 h-5 w-5 rounded border-border/70 text-accent focus:ring-accent"
                                            />
                                            <span>{step.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">
                                9. QA Signature <span className="text-red-600">*</span>
                            </label>
                            <div className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                                {user?.display_name || user?.email || "Current User"}
                            </div>
                            <p className="text-xs text-muted-foreground">Automatic signature recorded on submit.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">
                                10. Method <span className="text-red-600">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {(["Delivery", "Shipping"] as QAMethod[]).map((method) => (
                                    <label
                                        key={method}
                                        className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                                            form.method === method
                                                ? "border-accent bg-accent text-white"
                                                : "border-border bg-card text-foreground hover:border-accent"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="qa-method"
                                            value={method}
                                            checked={form.method === method}
                                            onChange={() => setForm((prev) => ({ ...prev, method }))}
                                            className="sr-only"
                                        />
                                        {method}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border bg-background p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                            {hasIncompleteSteps ? "Some required steps remain unchecked." : "Ready to submit."}
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                disabled={submitQaMutation.isPending}
                                className="rounded-2xl border border-transparent bg-card px-5 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submitQA}
                                disabled={submitQaMutation.isPending || !isFormComplete(form)}
                                className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
                                    submitQaMutation.isPending || !isFormComplete(form)
                                        ? "bg-muted text-muted-foreground/70 cursor-not-allowed"
                                        : "bg-accent hover:bg-maroon-800"
                                }`}
                            >
                                {submitQaMutation.isPending ? "Submitting..." : "Submit QA Checklist"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
