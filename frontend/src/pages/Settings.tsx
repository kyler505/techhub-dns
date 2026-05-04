import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";

import { inflowApi } from "../api/inflow";
import { ordersApi } from "../api/orders";
import { settingsApi } from "../api/settings";
import { useAuth } from "../contexts/AuthContext";
import { OrderStatus } from "../types/order";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { extractApiErrorMessage } from "../utils/apiErrors";
import { getUserDisplayName } from "../utils/userDisplay";

const TRANSPARENT_SIGNATURE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yl8X7kAAAAASUVORK5CYII=";

const reopenTargets = [OrderStatus.PICKED, OrderStatus.QA, OrderStatus.PRE_DELIVERY] as const;

const makeBypassSignatureData = () => ({
    signature_image: TRANSPARENT_SIGNATURE_IMAGE,
    placements: [
        {
            page_number: 1,
            x: 48,
            y: 48,
            width: 1,
            height: 1,
        },
    ],
});

export default function Settings() {
    const { user, isLoading: authLoading } = useAuth();
    const currentUserLabel = getUserDisplayName(user, "you");
    const currentUserIdentifier = user?.email ?? currentUserLabel ?? "system";

    const [recipientEmail, setRecipientEmail] = useState("");
    const [picklistOrderId, setPicklistOrderId] = useState("");
    const [signingOrderId, setSigningOrderId] = useState("");
    const [reopenOrderId, setReopenOrderId] = useState("");
    const [reopenTarget, setReopenTarget] = useState<OrderStatus>(OrderStatus.PICKED);
    const [reopenReason, setReopenReason] = useState("");
    const [ownershipOrderId, setOwnershipOrderId] = useState("");
    const [ownershipDeliverer, setOwnershipDeliverer] = useState("");
    const [runningAction, setRunningAction] = useState<string | null>(null);

    const testEmailMutation = useMutation({ mutationFn: async (email: string) => settingsApi.testEmail(email) });
    const testTeamsMutation = useMutation({ mutationFn: async (email: string) => settingsApi.testTeamsRecipient(email) });
    const testInflowMutation = useMutation({ mutationFn: async () => settingsApi.testInflow() });
    const testSharePointMutation = useMutation({ mutationFn: async () => settingsApi.testSharePoint() });
    const testWebhookMutation = useMutation({ mutationFn: async () => inflowApi.testWebhook() });
    const syncMutation = useMutation({ mutationFn: async () => inflowApi.sync() });
    const retryPicklistMutation = useMutation({ mutationFn: async (orderId: string) => settingsApi.retryPicklistPrint(orderId) });
    const bypassSigningMutation = useMutation({
        mutationFn: async ({ orderId }: { orderId: string }) => ordersApi.signOrder(orderId, makeBypassSignatureData()),
    });
    const reopenOrderMutation = useMutation({
        mutationFn: async ({ orderId, target, reason }: { orderId: string; target: OrderStatus; reason?: string }) =>
            ordersApi.rollbackOrderStatus(orderId, { status: target, reason }, currentUserIdentifier),
    });
    const overrideOwnershipMutation = useMutation({
        mutationFn: async ({ orderId, owner }: { orderId: string; owner: string }) =>
            ordersApi.updateOrder(orderId, { assigned_deliverer: owner }),
    });
    const syncHealthQuery = useQuery({
        queryKey: ["settings", "sync-health"],
        queryFn: async () => settingsApi.getSyncHealth(),
        refetchInterval: 60_000,
    });

    const busy =
        testEmailMutation.isPending ||
        testTeamsMutation.isPending ||
        testInflowMutation.isPending ||
        testSharePointMutation.isPending ||
        testWebhookMutation.isPending ||
        syncMutation.isPending ||
        retryPicklistMutation.isPending ||
        bypassSigningMutation.isPending ||
        reopenOrderMutation.isPending ||
        overrideOwnershipMutation.isPending;

    const handleRecipientActions = async (kind: "email" | "teams") => {
        if (!recipientEmail.trim()) {
            toast.error("Enter an email address to test");
            return;
        }

        try {
            setRunningAction(kind);
            if (kind === "email") {
                const result = await testEmailMutation.mutateAsync(recipientEmail.trim());
                if (result.success) toast.success("Test email queued", { description: result.message || undefined });
                else toast.error("Test email failed", { description: result.error || result.message || undefined });
            } else {
                const result = await testTeamsMutation.mutateAsync(recipientEmail.trim());
                if (result.success) toast.success("Test Teams message queued", { description: result.message || undefined });
                else toast.error("Test Teams message failed", { description: result.error || result.message || undefined });
            }
        } catch (error: unknown) {
            toast.error(kind === "email" ? "Test email failed" : "Test Teams message failed", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        } finally {
            setRunningAction(null);
        }
    };

    const handleSimpleAction = async (kind: "inflow" | "sharepoint" | "webhook" | "sync") => {
        try {
            setRunningAction(kind);
            if (kind === "inflow") {
                const result = await testInflowMutation.mutateAsync();
                if (result.success) toast.success("Inflow connection OK", { description: result.message || undefined });
                else toast.error("Inflow connection failed", { description: result.error || result.message || undefined });
            } else if (kind === "sharepoint") {
                const result = await testSharePointMutation.mutateAsync();
                if (result.success) toast.success("SharePoint connection OK", { description: result.message || undefined });
                else toast.error("SharePoint connection failed", { description: result.error || result.message || undefined });
            } else if (kind === "webhook") {
                const result = await testWebhookMutation.mutateAsync();
                toast.success("Webhook test queued", { description: result?.message || undefined });
            } else {
                const result = await syncMutation.mutateAsync();
                toast.success("Recovery sync completed", { description: result?.message || undefined });
            }
        } catch (error: unknown) {
            toast.error(kind === "sharepoint" ? "SharePoint connection failed" : kind === "inflow" ? "Inflow connection failed" : kind === "webhook" ? "Webhook test failed" : "Recovery sync failed", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        } finally {
            setRunningAction(null);
        }
    };

    const handleRetryPicklist = async () => {
        if (!picklistOrderId.trim()) {
            toast.error("Enter an order id to requeue");
            return;
        }

        try {
            setRunningAction("retry");
            const result = await retryPicklistMutation.mutateAsync(picklistOrderId.trim());
            toast.success("Picklist reprint queued", { description: result.job?.order_id ? `Order ${result.job.order_id}` : undefined });
        } catch (error: unknown) {
            toast.error("Failed to queue picklist reprint", { description: extractApiErrorMessage(error, "Please try again.") });
        } finally {
            setRunningAction(null);
        }
    };

    const handleBypassSigning = async () => {
        if (!signingOrderId.trim()) {
            toast.error("Enter an order id to sign");
            return;
        }

        try {
            setRunningAction("bypass-signing");
            const result = await bypassSigningMutation.mutateAsync({ orderId: signingOrderId.trim() });
            toast.success("Signing bypass completed", {
                description: result.message || `Order ${signingOrderId.trim()} moved to delivered`,
            });
        } catch (error: unknown) {
            toast.error("Failed to bypass signing", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        } finally {
            setRunningAction(null);
        }
    };

    const handleReopenOrder = async () => {
        if (!reopenOrderId.trim()) {
            toast.error("Enter an order id to reopen");
            return;
        }

        try {
            setRunningAction("reopen-order");
            const result = await reopenOrderMutation.mutateAsync({
                orderId: reopenOrderId.trim(),
                target: reopenTarget,
                reason: reopenReason.trim() || undefined,
            });
            toast.success("Order reopened", {
                description: `${result.inflow_order_id} -> ${result.status}`,
            });
        } catch (error: unknown) {
            toast.error("Failed to reopen order", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        } finally {
            setRunningAction(null);
        }
    };

    const handleOverrideOwnership = async () => {
        if (!ownershipOrderId.trim()) {
            toast.error("Enter an order id to reassign");
            return;
        }
        if (!ownershipDeliverer.trim()) {
            toast.error("Enter the new deliverer/owner");
            return;
        }

        try {
            setRunningAction("override-ownership");
            const result = await overrideOwnershipMutation.mutateAsync({
                orderId: ownershipOrderId.trim(),
                owner: ownershipDeliverer.trim(),
            });
            toast.success("Queue ownership updated", {
                description: `${result.inflow_order_id} assigned to ${result.assigned_deliverer || ownershipDeliverer.trim()}`,
            });
        } catch (error: unknown) {
            toast.error("Failed to override queue ownership", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        } finally {
            setRunningAction(null);
        }
    };

    const reopenTargetOptions = useMemo(
        () =>
            reopenTargets.map((status) => ({
                value: status,
                label: status.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
            })),
        [],
    );

    if (authLoading) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground">Loading operator actions.</p>
                </div>
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground">Operator actions, overrides, and recovery tools. Nothing on this page persists workflow policy.</p>
                </div>
                {currentUserLabel ? <span className="text-xs text-muted-foreground">Signed in as {currentUserLabel}</span> : null}
            </div>

            <Card className="border-border/70 bg-card/80">
                <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">Operator surface</CardTitle>
                        <Badge variant="secondary">Actions only</Badge>
                    </div>
                    <CardDescription>
                        Use this page to test integrations, recover queues, and run one-off overrides while durable rules stay on /admin.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Smoke tests</div>
                        <p className="mt-2 text-sm text-foreground">Email, Teams, Inflow, SharePoint, and webhook checks live here.</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recovery</div>
                        <p className="mt-2 text-sm text-foreground">Manual sync, requeue, reopen, and reassignment actions are available for incidents.</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overrides</div>
                        <p className="mt-2 text-sm text-foreground">One-off bypass and queue ownership actions are surfaced here for operator use.</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/80">
                <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">Sync health snapshot</CardTitle>
                        <Badge
                            variant={
                                syncHealthQuery.data?.inflow.webhook_failed
                                    ? "destructive"
                                    : syncHealthQuery.data?.inflow.webhook_enabled
                                        ? "success"
                                        : "secondary"
                            }
                        >
                            {syncHealthQuery.data?.inflow.webhook_failed
                                ? "Attention"
                                : syncHealthQuery.data?.inflow.webhook_enabled
                                    ? "Webhook on"
                                    : "Webhook off"}
                        </Badge>
                    </div>
                    <CardDescription>Quick read-only signals before using recovery actions.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Server time</div>
                        <p className="mt-2 text-sm text-foreground">{syncHealthQuery.data?.server_time ?? "-"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last webhook</div>
                        <p className="mt-2 text-sm text-foreground">{syncHealthQuery.data?.inflow.last_webhook_received_at ?? "Never"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Webhook state</div>
                        <p className="mt-2 text-sm text-foreground">
                            {syncHealthQuery.data?.inflow.webhook_enabled ? "Enabled" : "Disabled"}
                            {syncHealthQuery.data?.inflow.webhook_failed ? " · last attempt failed" : ""}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold tracking-tight">Test & verify</h2>
                            <Badge variant="secondary">Operator</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Run smoke tests before escalating to recovery or overrides.</p>
                    </div>
                    <div className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Recipient email</label>
                            <Input
                                type="email"
                                placeholder="recipient@tamu.edu"
                                value={recipientEmail}
                                onChange={(event) => setRecipientEmail(event.target.value)}
                                disabled={busy}
                            />
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Button onClick={() => void handleRecipientActions("email")} disabled={busy} className="btn-lift">
                                    {runningAction === "email" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                                    Test Email
                                </Button>
                                <Button variant="secondary" onClick={() => void handleRecipientActions("teams")} disabled={busy} className="btn-lift">
                                    {runningAction === "teams" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                                    Test Teams
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                            <div>
                                <div className="text-sm font-medium text-foreground">Connection smoke checks</div>
                                <p className="text-xs text-muted-foreground">Validate the integration endpoints before retrying work items.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Button variant="outline" onClick={() => void handleSimpleAction("inflow")} disabled={busy} className="btn-lift">
                                    {runningAction === "inflow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {runningAction === "inflow" ? "Testing..." : "Test Inflow"}
                                </Button>
                                <Button variant="outline" onClick={() => void handleSimpleAction("sharepoint")} disabled={busy} className="btn-lift">
                                    {runningAction === "sharepoint" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {runningAction === "sharepoint" ? "Testing..." : "Test SharePoint"}
                                </Button>
                                <Button variant="outline" onClick={() => void handleSimpleAction("webhook")} disabled={busy} className="btn-lift">
                                    {runningAction === "webhook" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Webhook test
                                </Button>
                                <Button variant="outline" onClick={() => void handleSimpleAction("sync")} disabled={busy} className="btn-lift">
                                    {runningAction === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Recovery sync
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold tracking-tight">Recovery queue controls</h2>
                            <Badge variant="secondary">Requeue</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Requeue picklists and refresh the operator recovery view when a job is blocked or missing.</p>
                    </div>
                    <div className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Order id</label>
                            <Input
                                placeholder="order id or inflow order id"
                                value={picklistOrderId}
                                onChange={(event) => setPicklistOrderId(event.target.value)}
                                disabled={busy}
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Button onClick={() => void handleRetryPicklist()} disabled={busy} className="btn-lift">
                                {runningAction === "retry" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                Requeue picklist
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setPicklistOrderId("");
                                    toast.message("Cleared recovery form");
                                }}
                                disabled={busy}
                                className="btn-lift"
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Clear form
                            </Button>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                            Queue controls are intentionally narrow: operators can recover or retry jobs here, while durable queue policy lives on /admin.
                        </div>
                    </div>
                </section>
            </div>

            <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold tracking-tight">Override actions</h2>
                        <Badge variant="warning">Operator</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">These are the remaining one-off operator controls: bypass signing, reopen a workflow, and reassign queue ownership.</p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="shadow-none">
                        <CardHeader className="p-4 pb-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-sm">Bypass signing for one order</CardTitle>
                                    <CardDescription className="mt-1">
                                        Completes signing with a transparent placeholder signature so the order can be recovered to Delivered.
                                    </CardDescription>
                                </div>
                                <Badge variant="secondary">Recovery</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <Input
                                placeholder="order id or inflow order id"
                                value={signingOrderId}
                                onChange={(event) => setSigningOrderId(event.target.value)}
                                disabled={busy}
                            />
                            <Button variant="outline" className="w-full btn-lift" onClick={() => void handleBypassSigning()} disabled={busy}>
                                {runningAction === "bypass-signing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                                {runningAction === "bypass-signing" ? "Bypassing..." : "Bypass signing"}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="shadow-none">
                        <CardHeader className="p-4 pb-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-sm">Force order reopen</CardTitle>
                                    <CardDescription className="mt-1">Rollback a stuck order to Picked, QA, or Pre-Delivery with a reason for audit follow-up.</CardDescription>
                                </div>
                                <Badge variant="secondary">Rollback</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <Input
                                placeholder="order id or inflow order id"
                                value={reopenOrderId}
                                onChange={(event) => setReopenOrderId(event.target.value)}
                                disabled={busy}
                            />
                            <select
                                value={reopenTarget}
                                onChange={(event) => setReopenTarget(event.target.value as OrderStatus)}
                                disabled={busy}
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {reopenTargetOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <Input
                                placeholder="reason for reopening"
                                value={reopenReason}
                                onChange={(event) => setReopenReason(event.target.value)}
                                disabled={busy}
                            />
                            <Button variant="outline" className="w-full btn-lift" onClick={() => void handleReopenOrder()} disabled={busy}>
                                {runningAction === "reopen-order" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                {runningAction === "reopen-order" ? "Reopening..." : "Reopen order"}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="shadow-none">
                        <CardHeader className="p-4 pb-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-sm">Override queue ownership</CardTitle>
                                    <CardDescription className="mt-1">Reassign the current owner/deliverer for an order when manual intervention is needed.</CardDescription>
                                </div>
                                <Badge variant="secondary">Ownership</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <Input
                                placeholder="order id or inflow order id"
                                value={ownershipOrderId}
                                onChange={(event) => setOwnershipOrderId(event.target.value)}
                                disabled={busy}
                            />
                            <Input
                                placeholder="new owner / deliverer"
                                value={ownershipDeliverer}
                                onChange={(event) => setOwnershipDeliverer(event.target.value)}
                                disabled={busy}
                            />
                            <Button variant="outline" className="w-full btn-lift" onClick={() => void handleOverrideOwnership()} disabled={busy}>
                                {runningAction === "override-ownership" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                {runningAction === "override-ownership" ? "Saving..." : "Update ownership"}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold tracking-tight">Recovery checklist</h2>
                        <Badge variant="secondary">Guidance</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Use these steps before escalating an incident.</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Clock className="h-4 w-4" />Confirm freshness</div>
                        <p className="mt-2 text-sm text-muted-foreground">Check whether the queue and the operator actions page were updated recently.</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground"><CheckCircle2 className="h-4 w-4" />Retry safely</div>
                        <p className="mt-2 text-sm text-muted-foreground">Requeue picklists only after the smoke tests and recovery sync have succeeded.</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground"><AlertTriangle className="h-4 w-4" />Escalate clearly</div>
                        <p className="mt-2 text-sm text-muted-foreground">If an override is needed, keep it temporary and document the reason for audit follow-up.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
