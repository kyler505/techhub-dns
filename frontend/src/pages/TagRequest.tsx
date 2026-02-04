import { useMemo, useRef, useState } from "react";
import { ClipboardList, Plus, Trash2, UploadCloud } from "lucide-react";
import { settingsApi } from "../api/settings";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

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
};

export default function TagRequest() {
    const [orderInput, setOrderInput] = useState("");
    const [orders, setOrders] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusState | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const confirmCancelRef = useRef<HTMLButtonElement | null>(null);

    const orderCount = orders.length;

    const statusStyles = useMemo(() => {
        if (!status) return null;
        return status.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-destructive/20 bg-destructive/5 text-destructive";
    }, [status]);

    const handleAddOrder = () => {
    const result = normalizeOrderInput(orderInput);
    if ("error" in result) {
        setError(result.error);
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
                });
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
