import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Plus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { ordersApi } from "../api/orders";
import { settingsApi } from "../api/settings";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatToCentralTime } from "../utils/timezone";

type TagRequestCandidate = {
    id: string;
    inflow_order_id: string;
    recipient_name?: string;
    delivery_location?: string;
    picklist_generated_at?: string;
};

type NormalizeOrderResult =
    | { normalized: string; error?: never }
    | { normalized?: never; error: string };

const parseTagRequestCandidate = (value: unknown): TagRequestCandidate | null => {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;

    const id = typeof record.id === "string" ? record.id.trim() : "";
    const inflowOrderId = typeof record.inflow_order_id === "string" ? record.inflow_order_id.trim() : "";
    if (!id || !inflowOrderId) return null;

    return {
        id,
        inflow_order_id: inflowOrderId,
        recipient_name: typeof record.recipient_name === "string" ? record.recipient_name : undefined,
        delivery_location: typeof record.delivery_location === "string" ? record.delivery_location : undefined,
        picklist_generated_at: typeof record.picklist_generated_at === "string" ? record.picklist_generated_at : undefined,
    };
};

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

const parseStringArray = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const next = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    return next.length > 0 ? next : [];
};

const parseIneligibleOrders = (value: unknown): Array<{ order: string; reason: string }> | undefined => {
    if (!Array.isArray(value)) return undefined;
    const next: Array<{ order: string; reason: string }> = [];
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const order = typeof record.order === "string" ? record.order.trim() : "";
        const reason = typeof record.reason === "string" ? record.reason.trim() : "";
        if (!order || !reason) continue;
        next.push({ order, reason });
    }
    return next.length > 0 ? next : [];
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
    eligibleOrders?: string[];
    ineligibleOrders?: Array<{ order: string; reason: string }>;
};

export default function TagRequest() {
    const [orderInput, setOrderInput] = useState("");
    const [orders, setOrders] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusState | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const confirmCancelRef = useRef<HTMLButtonElement | null>(null);

    const [candidates, setCandidates] = useState<TagRequestCandidate[]>([]);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [candidatesError, setCandidatesError] = useState<string | null>(null);
    const [candidatesSearch, setCandidatesSearch] = useState("");
    const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

    const [bulkPasteValue, setBulkPasteValue] = useState("");
    const [bulkPasteResult, setBulkPasteResult] = useState<string | null>(null);

    const orderCount = orders.length;

    const safeCandidates = candidates;

    const ordersSet = useMemo(() => new Set(orders), [orders]);

    const selectedCandidateSet = useMemo(() => new Set(selectedCandidates), [selectedCandidates]);

    const filteredCandidates = useMemo(() => {
        const query = candidatesSearch.trim().toLowerCase();
        if (!query) return safeCandidates;

        return safeCandidates.filter((candidate) => {
            const inflowOrderId = (candidate.inflow_order_id || "").toLowerCase();
            const recipientName = (candidate.recipient_name || "").toLowerCase();
            return inflowOrderId.includes(query) || recipientName.includes(query);
        });
    }, [safeCandidates, candidatesSearch]);

    const isInBatch = useMemo(() => {
        return (value: string) => {
            const compact = value.trim().toUpperCase();
            if (!compact) return false;
            if (ordersSet.has(compact)) return true;
            const normalized = normalizeOrderInput(compact);
            return "error" in normalized ? false : ordersSet.has(normalized.normalized);
        };
    }, [ordersSet]);

    useEffect(() => {
        setSelectedCandidates((prev) => prev.filter((candidateId) => !isInBatch(candidateId)));
    }, [isInBatch]);

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
        setBulkPasteResult(null);
    };

    const handleRemoveOrder = (orderNumber: string) => {
        setOrders((prev) => prev.filter((order) => order !== orderNumber));
    };

    const handleClearOrders = () => {
        setOrders([]);
        setStatus(null);
        setBulkPasteResult(null);
    };

    const loadCandidates = async () => {
        setCandidatesLoading(true);
        setCandidatesError(null);
        try {
            const result = (await ordersApi.getTagRequestCandidates({ limit: 1000 })) as unknown;

            if (!Array.isArray(result)) {
                setCandidates([]);
                setCandidatesError("Failed to load picked orders. Please refresh.");
                return;
            }

            const parsed = result
                .map(parseTagRequestCandidate)
                .filter((candidate): candidate is TagRequestCandidate => candidate !== null);
            setCandidates(parsed);
        } catch (err: any) {
            const maybeError = err?.response?.data?.error;
            setCandidatesError(
                typeof maybeError === "string" && maybeError.trim()
                    ? maybeError
                    : "Failed to load picked orders. Please refresh."
            );
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
        setBulkPasteResult(null);
    };

    const handleAddBulkPaste = () => {
        const raw = bulkPasteValue;
        const tokens = raw
            .split(/[\s,]+/g)
            .map((token) => token.trim())
            .filter(Boolean);

        if (tokens.length === 0) {
            setBulkPasteValue("");
            setBulkPasteResult("Added 0, 0 duplicates, 0 invalid");
            return;
        }

        const toAdd: string[] = [];
        const seen = new Set<string>(orders);
        let duplicates = 0;
        let invalid = 0;

        for (const token of tokens) {
            const normalized = normalizeOrderInput(token);
            if ("error" in normalized) {
                invalid += 1;
                continue;
            }
            if (seen.has(normalized.normalized)) {
                duplicates += 1;
                continue;
            }
            seen.add(normalized.normalized);
            toAdd.push(normalized.normalized);
        }

        if (toAdd.length > 0) {
            setOrders((prev) => [...prev, ...toAdd]);
        }

        setBulkPasteValue("");
        setBulkPasteResult(`Added ${toAdd.length}, ${duplicates} duplicates, ${invalid} invalid`);
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
                    eligibleOrders: response.eligible_orders,
                    ineligibleOrders: response.ineligible_orders,
                });
                void loadCandidates();
            } else {
                setStatus({
                    type: "error",
                    message: response.error || "Upload failed.",
                });
            }
        } catch (err: any) {
            const responseData = err?.response?.data as unknown;
            const record = responseData && typeof responseData === "object" ? (responseData as Record<string, unknown>) : null;

            const missingOrders = parseStringArray(record?.missing_orders);
            const ineligibleOrders = parseIneligibleOrders(record?.ineligible_orders);
            const backendError = typeof record?.error === "string" && record.error.trim() ? record.error.trim() : null;

            setStatus({
                type: "error",
                message: backendError || "Upload failed.",
                missingOrders,
                ineligibleOrders,
                eligibleOrders: parseStringArray(record?.eligible_orders),
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tag Request</h1>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr_0.8fr]">
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <CardTitle className="text-base">Candidates</CardTitle>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => void loadCandidates()}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="flex-1">
                                    <Input
                                        placeholder="Search TH#### or recipient"
                                        value={candidatesSearch}
                                        onChange={(event) => setCandidatesSearch(event.target.value)}
                                        aria-label="Search candidates"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Selected {selectedCandidates.length}</span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setSelectedCandidates((prev) => {
                                                const next = new Set(prev);
                                                for (const candidate of filteredCandidates) {
                                                    const inflowOrderId = candidate.inflow_order_id;
                                                    if (!inflowOrderId) continue;
                                                    if (isInBatch(inflowOrderId)) continue;
                                                    next.add(inflowOrderId);
                                                }
                                                return Array.from(next);
                                            });
                                        }}
                                        disabled={filteredCandidates.length === 0}
                                    >
                                        Select all visible
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSelectedCandidates([])}
                                        disabled={selectedCandidates.length === 0}
                                    >
                                        Clear selection
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleAddSelectedCandidates}
                                        disabled={selectedCandidates.length === 0}
                                        className="btn-lift"
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add selected
                                    </Button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                    Showing {filteredCandidates.length} of {safeCandidates.length}
                                </span>
                                {candidatesLoading ? <span>Loading...</span> : null}
                            </div>
                        </div>

                        {candidatesLoading && safeCandidates.length === 0 ? (
                            <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                                Loading picked orders...
                            </div>
                        ) : candidatesError ? (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                                {candidatesError}
                            </div>
                        ) : filteredCandidates.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                                No candidates found.
                            </div>
                        ) : (
                            <div className="rounded-lg border bg-card">
                                <div className="max-h-[26rem] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-card z-10">
                                            <TableRow>
                                                <TableHead className="w-10" />
                                                <TableHead>Order</TableHead>
                                                <TableHead>Recipient</TableHead>
                                                <TableHead className="text-right">Picklist</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredCandidates.map((candidate) => {
                                                const inflowOrderId = candidate.inflow_order_id;
                                                const inBatch = inflowOrderId ? isInBatch(inflowOrderId) : false;
                                                const checked = inflowOrderId ? selectedCandidateSet.has(inflowOrderId) : false;
                                                const disabled = !inflowOrderId || inBatch;

                                                return (
                                                    <TableRow key={candidate.id} data-state={checked ? "selected" : undefined}>
                                                        <TableCell className="w-10">
                                                            <Checkbox
                                                                checked={checked}
                                                                disabled={disabled}
                                                                aria-label={
                                                                    inflowOrderId
                                                                        ? `Select ${inflowOrderId}`
                                                                        : "Select candidate"
                                                                }
                                                                onChange={(event) => {
                                                                    if (!inflowOrderId) return;
                                                                    if (inBatch) return;
                                                                    toggleCandidateSelected(inflowOrderId, event.target.checked);
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-foreground">
                                                                    {candidate.inflow_order_id}
                                                                </span>
                                                                {inBatch ? (
                                                                    <Badge variant="secondary" className="whitespace-nowrap">
                                                                        In batch
                                                                    </Badge>
                                                                ) : null}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-foreground">
                                                                    {candidate.recipient_name || "Unknown recipient"}
                                                                </p>
                                                                {candidate.delivery_location ? (
                                                                    <p className="truncate text-xs text-muted-foreground">
                                                                        {candidate.delivery_location}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs text-muted-foreground">
                                                            {candidate.picklist_generated_at
                                                                ? formatToCentralTime(candidate.picklist_generated_at)
                                                                : "Pending"}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <CardTitle className="text-base">Batch builder</CardTitle>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleClearOrders}
                                disabled={orders.length === 0}
                            >
                                Clear batch
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3">
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
                                        aria-label="Add a single order"
                                    />
                                </div>
                                <Button type="button" onClick={handleAddOrder} className="btn-lift">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add
                                </Button>
                            </div>
                            {error ? <p className="text-sm text-destructive">{error}</p> : null}

                            <div className="space-y-2">
                                <textarea
                                    value={bulkPasteValue}
                                    onChange={(event) => setBulkPasteValue(event.target.value)}
                                    placeholder="Paste orders: 1234, TH2345, 3456 (comma / space / newline separated)"
                                    className="min-h-[6.5rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    aria-label="Paste multiple orders"
                                />
                                <div className="flex items-center justify-between gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleAddBulkPaste}
                                        disabled={bulkPasteValue.trim().length === 0}
                                    >
                                        Add pasted
                                    </Button>
                                    <span className="text-xs text-muted-foreground">{orderCount} total</span>
                                </div>
                                {bulkPasteResult ? (
                                    <p className="text-xs text-muted-foreground">{bulkPasteResult}</p>
                                ) : null}
                            </div>
                        </div>

                        {orders.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                                No orders added yet.
                            </div>
                        ) : (
                            <div className="rounded-lg border bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Order</TableHead>
                                            <TableHead className="w-12" />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => (
                                            <TableRow key={order}>
                                                <TableCell className="py-2">
                                                    <div className="flex items-center gap-2 text-foreground">
                                                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                                                        <span className="font-medium">{order}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2 text-right">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveOrder(order)}
                                                        aria-label={`Remove ${order}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="self-start lg:sticky lg:top-6">
                    <CardHeader>
                        <CardTitle className="text-base">Upload summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                            <p className="text-foreground font-medium">{orderCount} orders ready</p>
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
                                {status.ineligibleOrders && status.ineligibleOrders.length > 0 ? (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-medium">Ineligible</p>
                                        <ul className="flex flex-wrap gap-1">
                                            {status.ineligibleOrders.map(({ order, reason }) => (
                                                <li key={`${order}:${reason}`}>
                                                    <Badge
                                                        variant="outline"
                                                        className="whitespace-nowrap border-destructive/40 text-destructive"
                                                    >
                                                        {order} ({reason})
                                                    </Badge>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                                {status.missingOrders && status.missingOrders.length > 0 ? (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-medium">Missing locally</p>
                                        <ul className="flex flex-wrap gap-1">
                                            {status.missingOrders.map((order) => (
                                                <li key={order}>
                                                    <Badge variant="outline" className="whitespace-nowrap">
                                                        {order}
                                                    </Badge>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClearOrders}
                                disabled={orders.length === 0}
                            >
                                Clear batch
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
