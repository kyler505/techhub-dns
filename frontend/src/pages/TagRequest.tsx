import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Plus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { ordersApi } from "../api/orders";
import { settingsApi } from "../api/settings";
import { Checkbox } from "../components/ui/checkbox";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Order } from "../types/order";
import { formatToCentralTime } from "../utils/timezone";

type NormalizeOrderResult =
    | { normalized: string; error?: never }
    | { normalized?: never; error: string };

const normalizeOrderInput = (value: string): NormalizeOrderResult => {
    const compact = value.trim().toUpperCase().replace(/\s+/g, "");
    if (!compact) {
        return { error: "Enter a 4-digit order number." };
    }

    const digits = compact.startsWith("TH") ? compact.slice(2) : compact;
    if (!/^\d{4}$/.test(digits)) {
        return { error: "Order number must be 4 digits (e.g., 1234 or TH1234)." };
    }

    return { normalized: `TH${digits}` };
};

type StatusState = {
    type: "success" | "error";
    message: string;
    uploadedUrl?: string | null;
    filename?: string | null;
    count?: number;
    teamsNotified?: boolean;
    updatedOrders?: number;
    missingOrders?: string[];
};

export default function TagRequest() {
    const [orderInput, setOrderInput] = useState("");
    const [orders, setOrders] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusState | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const confirmCancelRef = useRef<HTMLButtonElement | null>(null);

    const [candidates, setCandidates] = useState<Order[]>([]);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [candidatesError, setCandidatesError] = useState<string | null>(null);
    const [candidatesSearch, setCandidatesSearch] = useState("");
    const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

    const orderCount = orders.length;

    const selectedCandidateSet = useMemo(() => new Set(selectedCandidates), [selectedCandidates]);

    const filteredCandidates = useMemo(() => {
        const query = candidatesSearch.trim().toLowerCase();
        if (!query) return candidates;

        return candidates.filter((candidate) => {
            const inflowOrderId = (candidate.inflow_order_id || "").toLowerCase();
            const recipientName = (candidate.recipient_name || "").toLowerCase();
            return inflowOrderId.includes(query) || recipientName.includes(query);
        });
    }, [candidates, candidatesSearch]);

    const statusStyles = useMemo(() => {
        if (!status) return null;
        return status.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-destructive/20 bg-destructive/5 text-destructive";
    }, [status]);

    const handleAddOrder = () => {
        const result = normalizeOrderInput(orderInput);
        if ("error" in result) {
            setError(result.error ?? "Enter a 4-digit order number.");
            return;
        }

        const normalizedOrder = result.normalized;

        if (orders.includes(normalizedOrder)) {
            setError(`Order ${normalizedOrder} is already in the list.`);
            return;
        }

        setOrders((prev) => [...prev, normalizedOrder]);
        setOrderInput("");
        setError(null);
    };

    const handleRemoveOrder = (orderNumber: string) => {
        setOrders((prev) => prev.filter((order) => order !== orderNumber));
    };

    const handleClearOrders = () => {
        setOrders([]);
        setStatus(null);
    };

    const loadCandidates = async () => {
        setCandidatesLoading(true);
        setCandidatesError(null);
        try {
            const result = await ordersApi.getTagRequestCandidates({ limit: 1000 });
            setCandidates(result);
        } catch (err: any) {
            setCandidatesError(err?.response?.data?.error || "Failed to load picked orders.");
        } finally {
            setCandidatesLoading(false);
        }
    };

    useEffect(() => {
        void loadCandidates();
    }, []);

    const toggleCandidateSelected = (inflowOrderId: string, checked: boolean) => {
        setSelectedCandidates((prev) => {
            if (checked) {
                return prev.includes(inflowOrderId) ? prev : [...prev, inflowOrderId];
            }
            return prev.filter((id) => id !== inflowOrderId);
        });
    };

    const handleAddSelectedCandidates = () => {
        if (selectedCandidates.length === 0) return;

        const normalizedSelected: string[] = [];
        for (const inflowOrderId of selectedCandidates) {
            const normalized = normalizeOrderInput(inflowOrderId);
            if ("error" in normalized) continue;
            normalizedSelected.push(normalized.normalized);
        }

        if (normalizedSelected.length === 0) return;

        setOrders((prev) => {
            const existing = new Set(prev);
            const next = [...prev];
            for (const th of normalizedSelected) {
                if (existing.has(th)) continue;
                existing.add(th);
                next.push(th);
            }
            return next;
        });
        setSelectedCandidates([]);
        setError(null);
    };

    const handleUpload = async () => {
        setSubmitting(true);
        setStatus(null);
        try {
            const response = await settingsApi.uploadCanopyOrders(orders);
            if (response.success) {
                setStatus({
                    type: "success",
                    message: "Orders uploaded to Canopy.",
                    uploadedUrl: response.uploaded_url,
                    filename: response.filename,
                    count: response.count,
                    teamsNotified: response.teams_notified,
                    updatedOrders: response.updated_orders,
                    missingOrders: response.missing_orders,
                });
                void loadCandidates();
            } else {
                setStatus({
                    type: "error",
                    message: response.error || "Upload failed.",
                });
            }
        } catch (err: any) {
            setStatus({
                type: "error",
                message: err?.response?.data?.error || "Upload failed.",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tag Request</h1>
                <p className="text-sm text-muted-foreground">Legacy Canopy orders uploader for tag request batches.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base">Picked orders needing tag request</CardTitle>
                                    <CardDescription>
                                        Picked + untagged orders that have not been sent in a Canopy batch.
                                    </CardDescription>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => void loadCandidates()}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <Input
                                    placeholder="Search TH#### or recipient"
                                    value={candidatesSearch}
                                    onChange={(event) => setCandidatesSearch(event.target.value)}
                                />
                                <Button
                                    type="button"
                                    onClick={handleAddSelectedCandidates}
                                    disabled={selectedCandidates.length === 0}
                                    className="btn-lift"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add selected
                                </Button>
                            </div>

                            {candidatesLoading ? (
                                <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                                    Loading picked orders...
                                </div>
                            ) : candidatesError ? (
                                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                                    {candidatesError}
                                </div>
                            ) : filteredCandidates.length === 0 ? (
                                <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                                    No candidates found.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                                    {filteredCandidates.map((candidate) => {
                                        const checked = selectedCandidateSet.has(candidate.inflow_order_id);
                                        return (
                                            <div
                                                key={candidate.id}
                                                className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <Checkbox
                                                        checked={checked}
                                                        onChange={(event) =>
                                                            toggleCandidateSelected(
                                                                candidate.inflow_order_id,
                                                                event.target.checked
                                                            )
                                                        }
                                                        className="mt-0.5"
                                                    />
                                                    <div className="space-y-0.5">
                                                        <p className="font-medium text-foreground">{candidate.inflow_order_id}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {candidate.recipient_name || "Unknown recipient"}
                                                            {candidate.delivery_location
                                                                ? ` · ${candidate.delivery_location}`
                                                                : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right text-xs text-muted-foreground">
                                                    {candidate.picklist_generated_at
                                                        ? `Picklist ${formatToCentralTime(candidate.picklist_generated_at)}`
                                                        : "Picklist pending"}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Order numbers</CardTitle>
                            <CardDescription>Enter 4-digit order numbers (TH prefix optional).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="flex-1">
                                    <Input
                                        placeholder="1234 or TH1234"
                                        value={orderInput}
                                        onChange={(event) => {
                                            setOrderInput(event.target.value);
                                            if (error) setError(null);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                handleAddOrder();
                                            }
                                        }}
                                    />
                                </div>
                                <Button type="button" onClick={handleAddOrder} className="btn-lift">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add
                                </Button>
                            </div>
                            {error ? <p className="text-sm text-destructive">{error}</p> : null}

                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-foreground">Order list</span>
                                    <span className="text-muted-foreground">{orderCount} total</span>
                                </div>
                                {orders.length === 0 ? (
                                    <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                                        No orders added yet.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {orders.map((order) => (
                                            <div
                                                key={order}
                                                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
                                            >
                                                <div className="flex items-center gap-2 text-foreground">
                                                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                                                    {order}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveOrder(order)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Upload summary</CardTitle>
                        <CardDescription>Review and submit the orders list.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                            <p className="text-foreground font-medium">Ready to upload {orderCount} order(s).</p>
                            <p className="mt-1">The uploader creates a JSON file in the legacy Canopy WebDAV folder.</p>
                        </div>

                        {status ? (
                            <div className={`rounded-lg border p-4 text-sm ${statusStyles}`}>
                                <p className="font-medium">{status.message}</p>
                                {status.uploadedUrl ? (
                                    <p className="mt-2 text-sm">
                                        File URL:{" "}
                                        <a
                                            href={status.uploadedUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-primary underline"
                                        >
                                            {status.uploadedUrl}
                                        </a>
                                    </p>
                                ) : null}
                                {status.filename ? <p className="mt-1 text-xs">Filename: {status.filename}</p> : null}
                                {typeof status.teamsNotified === "boolean" ? (
                                    <p className="mt-1 text-xs">
                                        Teams notification: {status.teamsNotified ? "sent" : "not sent"}
                                    </p>
                                ) : null}
                                {typeof status.updatedOrders === "number" ? (
                                    <p className="mt-1 text-xs">Updated local orders: {status.updatedOrders}</p>
                                ) : null}
                                {status.missingOrders && status.missingOrders.length > 0 ? (
                                    <p className="mt-1 text-xs">Missing locally: {status.missingOrders.join(", ")}</p>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClearOrders}
                                disabled={orders.length === 0}
                            >
                                Clear list
                            </Button>
                            <Button
                                type="button"
                                onClick={() => setConfirmOpen(true)}
                                disabled={orders.length === 0 || submitting}
                                className="btn-lift"
                            >
                                <UploadCloud className="mr-2 h-4 w-4" />
                                {submitting ? "Uploading..." : "Upload orders"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        confirmCancelRef.current?.focus();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Upload orders to Canopy?</DialogTitle>
                        <DialogDescription>
                            This will upload {orderCount} order(s) to the legacy WebDAV endpoint and notify Teams.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            ref={confirmCancelRef}
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmOpen(false)}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                setConfirmOpen(false);
                                void handleUpload();
                            }}
                            disabled={submitting}
                        >
                            Upload now
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
