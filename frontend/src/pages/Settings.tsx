import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, ShieldAlert, Trash2, Zap } from "lucide-react";
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

const TRANSPARENT_SIGNATURE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yl8X7kAAAAASUVORK5CYII=";

const reopenTargets = [OrderStatus.PICKED, OrderStatus.QA, OrderStatus.PRE_DELIVERY] as const;

const makeBypassSignatureData = () => ({
    signature_image: TRANSPARENT_SIGNATURE_IMAGE,
    placements: [{ page_number: 1, x: 48, y: 48, width: 1, height: 1 }],
});

export default function Settings() {
    const { user, isLoading: authLoading } = useAuth();
    const queryClient = useQueryClient();
    const currentUserLabel = user?.email ?? "system";

    const [recipientEmail, setRecipientEmail] = useState("");
    const [picklistOrderId, setPicklistOrderId] = useState("");
    const [signingOrderId, setSigningOrderId] = useState("");
    const [reopenOrderId, setReopenOrderId] = useState("");
    const [reopenTarget, setReopenTarget] = useState<OrderStatus>(OrderStatus.PICKED);
    const [reopenReason, setReopenReason] = useState("");
    const [ownershipOrderId, setOwnershipOrderId] = useState("");
    const [ownershipDeliverer, setOwnershipDeliverer] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [webhookEvents, setWebhookEvents] = useState("");
    const [runningAction, setRunningAction] = useState<string | null>(null);

    const webhookDefaultsQuery = useQuery({
        queryKey: ["settings", "webhook-defaults"],
        queryFn: async () => inflowApi.getWebhookDefaults(),
        refetchOnWindowFocus: false,
    });
    const webhooksQuery = useQuery({
        queryKey: ["settings", "webhooks"],
        queryFn: async () => inflowApi.listWebhooks(),
        refetchInterval: 60_000,
    });

    useEffect(() => {
        const defaults = webhookDefaultsQuery.data;
        if (!defaults) return;
        setWebhookUrl((prev) => prev || defaults.url || "");
        setWebhookEvents((prev) => prev || defaults.events.join(", "));
    }, [webhookDefaultsQuery.data]);

    const testEmailMutation = useMutation({ mutationFn: async (email: string) => settingsApi.testEmail(email) });
    const testTeamsMutation = useMutation({ mutationFn: async (email: string) => settingsApi.testTeamsRecipient(email) });
    const testInflowMutation = useMutation({ mutationFn: async () => settingsApi.testInflow() });
    const testSharePointMutation = useMutation({ mutationFn: async () => settingsApi.testSharePoint() });
    const testWebhookMutation = useMutation({ mutationFn: async () => inflowApi.testWebhook() });
    const syncMutation = useMutation({ mutationFn: async () => inflowApi.sync() });
    const retryPicklistMutation = useMutation({ mutationFn: async (orderId: string) => settingsApi.retryPicklistPrint(orderId) });
    const registerWebhookMutation = useMutation({
        mutationFn: async ({ url, events }: { url: string; events: string[] }) => inflowApi.registerWebhook({ url, events }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] }),
                queryClient.invalidateQueries({ queryKey: ["settings", "webhook-defaults"] }),
            ]);
            toast.success("Webhook registered", {
                description: "The Inflow webhook subscription was recreated from the admin settings page.",
            });
        },
    });
    const deleteWebhookMutation = useMutation({
        mutationFn: async (webhookId: string) => inflowApi.deleteWebhook(webhookId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] });
            toast.success("Webhook deleted", { description: "The selected subscription was removed." });
        },
    });
    const bypassSigningMutation = useMutation({
        mutationFn: async ({ orderId }: { orderId: string }) => ordersApi.signOrder(orderId, makeBypassSignatureData()),
    });
    const reopenOrderMutation = useMutation({
        mutationFn: async ({ orderId, target, reason }: { orderId: string; target: OrderStatus; reason?: string }) =>
            ordersApi.rollbackOrderStatus(orderId, { status: target, reason }, currentUserLabel),
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

    const reopenTargetOptions = useMemo(
        () =>
            reopenTargets.map((status) => ({
                value: status,
                label: status.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
            })),
        [],
    );

    const webhookEventList = useMemo(
        () => webhookEvents.split(",").map((item) => item.trim()).filter(Boolean),
        [webhookEvents],
    );

    const webhookBusy =
        registerWebhookMutation.isPending || deleteWebhookMutation.isPending || webhooksQuery.isFetching || webhookDefaultsQuery.isFetching;

    const handleRegisterWebhook = async () => {
        const url = webhookUrl.trim();
        const events = webhookEventList;
        if (!url) {
            toast.error("Enter a webhook URL");
            return;
        }
        if (!events.length) {
            toast.error("Enter at least one webhook event");
            return;
        }
        try {
            setRunningAction("register-webhook");
            await registerWebhookMutation.mutateAsync({ url, events });
        } catch (error: unknown) {
            toast.error("Failed to register webhook", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        } finally {
            setRunningAction(null);
        }
    };

    const handleUseWebhookDefaults = () => {
        const defaults = webhookDefaultsQuery.data;
        if (!defaults) return;
        setWebhookUrl(defaults.url || "");
        setWebhookEvents(defaults.events.join(", "));
    };

    const handleDeleteWebhook = async (webhookId: string) => {
        try {
            setRunningAction(`delete-webhook:${webhookId}`);
            await deleteWebhookMutation.mutateAsync(webhookId);
        } catch (error: unknown) {
            toast.error("Failed to delete webhook", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        } finally {
            setRunningAction(null);
        }
    };

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
        overrideOwnershipMutation.isPending ||
        webhookBusy;

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
            const label = kind === "sharepoint" ? "SharePoint" : kind === "inflow" ? "Inflow" : kind === "webhook" ? "Webhook" : "Sync";
            toast.error(`${label} failed`, { description: extractApiErrorMessage(error, "Please try again.") });
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
            toast.error("Enter an order id");
            return;
        }
        try {
            setRunningAction("bypass-signing");
            const result = await bypassSigningMutation.mutateAsync({ orderId: signingOrderId.trim() });
            toast.success("Signing bypass completed", { description: result.message || `Order ${signingOrderId.trim()} moved to delivered` });
        } catch (error: unknown) {
            toast.error("Failed to bypass signing", { description: extractApiErrorMessage(error, "Please try again.") });
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
            toast.success("Order reopened", { description: `${result.inflow_order_id} → ${result.status}` });
        } catch (error: unknown) {
            toast.error("Failed to reopen order", { description: extractApiErrorMessage(error, "Please try again.") });
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
            toast.error("Enter the new deliverer");
            return;
        }
        try {
            setRunningAction("override-ownership");
            const result = await overrideOwnershipMutation.mutateAsync({
                orderId: ownershipOrderId.trim(),
                owner: ownershipDeliverer.trim(),
            });
            toast.success("Queue ownership updated", {
                description: `${result.inflow_order_id} → ${result.assigned_deliverer || ownershipDeliverer.trim()}`,
            });
        } catch (error: unknown) {
            toast.error("Failed to override queue ownership", { description: extractApiErrorMessage(error, "Please try again.") });
        } finally {
            setRunningAction(null);
        }
    };

    if (authLoading) {
        return (
            <div className="container mx-auto py-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground">Smoke tests, recovery, and one-off overrides. Durable policy lives on /admin.</p>
            </div>

            <Card className="border-border/70 bg-card/80">
                <CardHeader>
                    <CardTitle className="text-base">Sync health</CardTitle>
                    <CardDescription>
                        {syncHealthQuery.data?.inflow.webhook_enabled ? "Webhook enabled" : "Webhook disabled"}
                        {syncHealthQuery.data?.inflow.webhook_failed ? " · last attempt failed" : ""}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="text-xs font-medium uppercase text-muted-foreground">Server time</div>
                        <p className="mt-1 text-sm">{syncHealthQuery.data?.server_time ?? "-"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="text-xs font-medium uppercase text-muted-foreground">Last webhook</div>
                        <p className="mt-1 text-sm">{syncHealthQuery.data?.inflow.last_webhook_received_at ?? "Never"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="text-xs font-medium uppercase text-muted-foreground">Webhook state</div>
                        <p className="mt-1 text-sm">
                            {syncHealthQuery.data?.inflow.webhook_enabled ? "Enabled" : "Disabled"}
                            {syncHealthQuery.data?.inflow.webhook_failed ? " · last attempt failed" : ""}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="rounded-2xl border border-border/70 bg-card/80 p-5">
                    <div className="space-y-2">
                        <h2 className="text-base font-semibold">Smoke tests</h2>
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
                                <Button onClick={() => void handleRecipientActions("email")} disabled={busy}>
                                    {runningAction === "email" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                                    Test Email
                                </Button>
                                <Button variant="secondary" onClick={() => void handleRecipientActions("teams")} disabled={busy}>
                                    {runningAction === "teams" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                                    Test Teams
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                            <div className="text-sm font-medium">Integrations</div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Button variant="outline" onClick={() => void handleSimpleAction("inflow")} disabled={busy}>
                                    {runningAction === "inflow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {runningAction === "inflow" ? "Testing..." : "Test Inflow"}
                                </Button>
                                <Button variant="outline" onClick={() => void handleSimpleAction("sharepoint")} disabled={busy}>
                                    {runningAction === "sharepoint" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {runningAction === "sharepoint" ? "Testing..." : "Test SharePoint"}
                                </Button>
                                <Button variant="outline" onClick={() => void handleSimpleAction("webhook")} disabled={busy}>
                                    {runningAction === "webhook" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Webhook test
                                </Button>
                                <Button variant="outline" onClick={() => void handleSimpleAction("sync")} disabled={busy}>
                                    {runningAction === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Recovery sync
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <div className="text-sm font-medium">Webhook management</div>
                                    <p className="text-xs text-muted-foreground">
                                        Recreate the Inflow webhook subscription after it was removed from the admin settings.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={handleUseWebhookDefaults} disabled={webhookBusy}>
                                    Use defaults
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <Input
                                    placeholder={webhookDefaultsQuery.data?.url || "https://dev-techhub.pythonanywhere.com/api/inflow/webhook"}
                                    value={webhookUrl}
                                    onChange={(event) => setWebhookUrl(event.target.value)}
                                    disabled={busy}
                                />
                                <Input
                                    placeholder="orderCreated, orderUpdated"
                                    value={webhookEvents}
                                    onChange={(event) => setWebhookEvents(event.target.value)}
                                    disabled={busy}
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button onClick={() => void handleRegisterWebhook()} disabled={busy || webhookBusy}>
                                    {runningAction === "register-webhook" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    {runningAction === "register-webhook" ? "Registering..." : "Register / re-register webhook"}
                                </Button>
                                <Button variant="secondary" onClick={() => void webhooksQuery.refetch()} disabled={webhookBusy}>
                                    Refresh list
                                </Button>
                            </div>

                            <div className="space-y-3">
                                <div className="text-xs font-medium uppercase text-muted-foreground">Current webhooks</div>
                                {webhooksQuery.data?.webhooks?.length ? (
                                    <div className="space-y-2">
                                        {webhooksQuery.data.webhooks.map((webhook) => (
                                            <div key={webhook.id} className="rounded-lg border bg-background/60 p-3">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="space-y-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-sm font-medium">{webhook.webhook_id}</span>
                                                            <Badge variant={webhook.status === "active" ? "success" : "secondary"}>{webhook.status}</Badge>
                                                        </div>
                                                        <p className="break-all text-xs text-muted-foreground">{webhook.url}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {webhook.events.join(", ") || "No events recorded"}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => void handleDeleteWebhook(webhook.webhook_id)}
                                                        disabled={busy}
                                                    >
                                                        {runningAction === `delete-webhook:${webhook.webhook_id}` ? (
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                        )}
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No active webhook registrations found.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-border/70 bg-card/80 p-5">
                    <div className="space-y-2">
                        <h2 className="text-base font-semibold">Recovery</h2>
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
                        <Button onClick={() => void handleRetryPicklist()} disabled={busy} className="w-full sm:w-auto">
                            {runningAction === "retry" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Requeue picklist
                        </Button>
                    </div>
                </section>
            </div>

            <section className="rounded-2xl border border-border/70 bg-card/80 p-5">
                <div className="space-y-2">
                    <h2 className="text-base font-semibold">Overrides</h2>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="shadow-none">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm">Bypass signing</CardTitle>
                            <CardDescription className="mt-1">Sign with a transparent placeholder to force delivery.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <Input
                                placeholder="order id"
                                value={signingOrderId}
                                onChange={(event) => setSigningOrderId(event.target.value)}
                                disabled={busy}
                            />
                            <Button variant="outline" className="w-full" onClick={() => void handleBypassSigning()} disabled={busy}>
                                {runningAction === "bypass-signing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                                {runningAction === "bypass-signing" ? "Bypassing..." : "Bypass signing"}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="shadow-none">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm">Force reopen</CardTitle>
                            <CardDescription className="mt-1">Rollback an order to an earlier status.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <Input
                                placeholder="order id"
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
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <Input
                                placeholder="reason (optional)"
                                value={reopenReason}
                                onChange={(event) => setReopenReason(event.target.value)}
                                disabled={busy}
                            />
                            <Button variant="outline" className="w-full" onClick={() => void handleReopenOrder()} disabled={busy}>
                                {runningAction === "reopen-order" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                {runningAction === "reopen-order" ? "Reopening..." : "Reopen order"}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="shadow-none">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm">Override ownership</CardTitle>
                            <CardDescription className="mt-1">Reassign the deliverer for an order.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <Input
                                placeholder="order id"
                                value={ownershipOrderId}
                                onChange={(event) => setOwnershipOrderId(event.target.value)}
                                disabled={busy}
                            />
                            <Input
                                placeholder="new deliverer"
                                value={ownershipDeliverer}
                                onChange={(event) => setOwnershipDeliverer(event.target.value)}
                                disabled={busy}
                            />
                            <Button variant="outline" className="w-full" onClick={() => void handleOverrideOwnership()} disabled={busy}>
                                {runningAction === "override-ownership" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {runningAction === "override-ownership" ? "Saving..." : "Update ownership"}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}
