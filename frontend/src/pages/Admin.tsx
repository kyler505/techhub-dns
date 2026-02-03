import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { inflowApi, WebhookResponse } from "../api/inflow";
import { apiClient } from "../api/client";
import { settingsApi, SystemSettings } from "../api/settings";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2, Zap } from "lucide-react";

interface FeatureStatus {
    name: string;
    enabled: boolean;
    configured: boolean;
    status: "active" | "warning" | "disabled" | "error";
    details?: string;
    error?: string;
}

interface SystemStatus {
    saml_auth: FeatureStatus;
    graph_api: FeatureStatus;
    sharepoint: FeatureStatus;
    inflow_sync: FeatureStatus;
}

interface CanopyUploadResponse {
    filename: string;
    uploaded_url: string;
    count: number;
    teams_notified: boolean;
}

// Default values when settings haven't been loaded yet
const DEFAULT_SETTING = { value: "true", description: "Loading...", updated_at: null, updated_by: null };

// Helper to safely get a setting value
const getSetting = (settings: SystemSettings | null, key: keyof SystemSettings) => {
    return settings?.[key] ?? DEFAULT_SETTING;
};

const normalizeCanopyOrder = (raw: string) => {
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) return null;
    const value = trimmed.startsWith("TH") ? trimmed.slice(2) : trimmed;
    if (!/^\d{4}$/.test(value)) return null;
    return `TH${value}`;
};

const parseCanopyOrders = (raw: string) => {
    const tokens = raw.split(/[\s,]+/).filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    tokens.forEach((token) => {
        const normalized = normalizeCanopyOrder(token);
        if (!normalized) {
            invalid.push(token);
            return;
        }
        if (seen.has(normalized)) return;
        seen.add(normalized);
        valid.push(normalized);
    });

    return { valid, invalid };
};

export default function Admin() {
    const { user } = useAuth();
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<"overview" | "notifications" | "operations">("overview");

    // Inflow webhook state
    const [inflowWebhooks, setInflowWebhooks] = useState<WebhookResponse[]>([]);
    const [registeringWebhook, setRegisteringWebhook] = useState(false);
    const [deletingWebhookId, setDeletingWebhookId] = useState<string | null>(null);
    const [webhookToDelete, setWebhookToDelete] = useState<WebhookResponse | null>(null);

    // Testing state
    const [testEmailAddress, setTestEmailAddress] = useState("");
    const [testingService, setTestingService] = useState<string | null>(null);

    const [togglingSettingKey, setTogglingSettingKey] = useState<string | null>(null);
    const [syncDialogOpen, setSyncDialogOpen] = useState(false);
    const [manualSyncing, setManualSyncing] = useState(false);

    const [canopyInput, setCanopyInput] = useState("");
    const [canopyOrders, setCanopyOrders] = useState<string[]>([]);
    const [canopyUploading, setCanopyUploading] = useState(false);
    const [canopyDialogOpen, setCanopyDialogOpen] = useState(false);
    const [canopyError, setCanopyError] = useState<string | null>(null);
    const [canopyResult, setCanopyResult] = useState<CanopyUploadResponse | null>(null);

    const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const syncCancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const canopyCancelButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        loadSystemStatus();
        loadInflowWebhooks();
        loadSystemSettings();
    }, []);

    const loadSystemStatus = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get("/system/status");
            setSystemStatus(response.data);
        } catch (error) {
            console.error("Failed to load system status:", error);
            toast.error("Failed to load system status. Showing last-known defaults.");
            setSystemStatus({
                saml_auth: { name: "TAMU SSO", enabled: false, configured: false, status: "disabled" },
                graph_api: { name: "Microsoft Graph", enabled: false, configured: false, status: "disabled" },
                sharepoint: { name: "SharePoint Storage", enabled: true, configured: true, status: "active" },
                inflow_sync: { name: "Inflow Sync", enabled: true, configured: true, status: "active" },
            });
        } finally {
            setLoading(false);
        }
    };

    const loadSystemSettings = async () => {
        try {
            const settings = await settingsApi.getSettings();
            setSystemSettings(settings);
        } catch (error) {
            console.error("Failed to load system settings:", error);
            toast.error("Failed to load notification settings.");
        }
    };

    const loadInflowWebhooks = async () => {
        try {
            const response = await inflowApi.listWebhooks();
            setInflowWebhooks(response.webhooks);
        } catch (error) {
            console.error("Failed to load Inflow webhooks:", error);
            toast.error("Failed to load Inflow webhooks.");
        }
    };

    const handleToggleSetting = async (key: string, currentValue: string) => {
        const newValue = currentValue === "true" ? "false" : "true";
        try {
            setTogglingSettingKey(key);
            await settingsApi.updateSetting(key, newValue, user?.email || "admin");
            await loadSystemSettings();
            toast.success("Setting updated", { description: `${key} = ${newValue}` });
        } catch (error: any) {
            console.error("Failed to update setting:", error);
            toast.error("Failed to update setting", {
                description: error.response?.data?.error || "Please try again.",
            });
        } finally {
            setTogglingSettingKey(null);
        }
    };

    const handleAutoRegisterWebhook = async () => {
        setRegisteringWebhook(true);
        try {
            const defaults = await inflowApi.getWebhookDefaults();
            await inflowApi.registerWebhook({
                url: defaults.url || "",
                events: defaults.events || [],
            });
            toast.success("Inflow webhook registered");
            await loadInflowWebhooks();
        } catch (error: any) {
            console.error("Failed to register webhook:", error);
            toast.error("Failed to register webhook", {
                description: error.response?.data?.detail || "Please try again.",
            });
        } finally {
            setRegisteringWebhook(false);
        }
    };

    const handleDeleteInflowWebhook = async (webhookId: string) => {
        try {
            setDeletingWebhookId(webhookId);
            await inflowApi.deleteWebhook(webhookId);
            toast.success("Webhook deleted");
            await loadInflowWebhooks();
            return true;
        } catch (error: any) {
            console.error("Failed to delete webhook:", error);
            toast.error("Failed to delete webhook", {
                description: error.response?.data?.detail || "Please try again.",
            });
            return false;
        } finally {
            setDeletingWebhookId(null);
        }
    };

    const handleTestEmail = async () => {
        if (!testEmailAddress) {
            toast.error("Enter an email address to test");
            return;
        }
        setTestingService("email");
        try {
            const result = await settingsApi.testEmail(testEmailAddress);
            if (result.success) {
                toast.success("Test email queued", { description: result.message || undefined });
            } else {
                toast.error("Test email failed", { description: result.error || result.message || undefined });
            }
        } catch (error: any) {
            toast.error("Test email failed", { description: error.response?.data?.error || "Please try again." });
        } finally {
            setTestingService(null);
        }
    };

    const handleTestTeamsRecipient = async () => {
        if (!testEmailAddress) {
            toast.error("Enter an email address to test");
            return;
        }
        setTestingService("teams");
        try {
            const result = await settingsApi.testTeamsRecipient(testEmailAddress);
            if (result.success) {
                toast.success("Test Teams message queued", { description: result.message || undefined });
            } else {
                toast.error("Test Teams message failed", { description: result.error || result.message || undefined });
            }
        } catch (error: any) {
            toast.error("Test Teams message failed", {
                description: error.response?.data?.error || "Please try again.",
            });
        } finally {
            setTestingService(null);
        }
    };

    const handleTestInflow = async () => {
        setTestingService("inflow");
        try {
            const result = await settingsApi.testInflow();
            if (result.success) {
                toast.success("Inflow connection OK", { description: result.message || undefined });
            } else {
                toast.error("Inflow connection failed", { description: result.error || result.message || undefined });
            }
        } catch (error: any) {
            toast.error("Inflow connection failed", {
                description: error.response?.data?.error || "Please try again.",
            });
        } finally {
            setTestingService(null);
        }
    };

    const handleTestSharePoint = async () => {
        setTestingService("sharepoint");
        try {
            const result = await settingsApi.testSharePoint();
            if (result.success) {
                toast.success("SharePoint connection OK", { description: result.message || undefined });
            } else {
                toast.error("SharePoint connection failed", { description: result.error || result.message || undefined });
            }
        } catch (error: any) {
            toast.error("SharePoint connection failed", {
                description: error.response?.data?.error || "Please try again.",
            });
        } finally {
            setTestingService(null);
        }
    };

    const getStatusBadgeVariant = (status: FeatureStatus["status"]) => {
        switch (status) {
            case "active":
                return "success";
            case "warning":
                return "warning";
            case "disabled":
                return "secondary";
            case "error":
                return "destructive";
        }
    };

    const systemStatusList = useMemo(() => {
        if (!systemStatus) return [];
        return Object.values(systemStatus);
    }, [systemStatus]);

    if (loading) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin</h1>
                    <p className="text-sm text-slate-500">Loading system configuration and diagnostics.</p>
                </div>
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const activeWebhook = inflowWebhooks.find((w) => w.status === "active");

    const confirmDeleteWebhook = async () => {
        if (!webhookToDelete) return;
        const ok = await handleDeleteInflowWebhook(webhookToDelete.webhook_id);
        if (ok) setWebhookToDelete(null);
    };

    const runManualSync = async () => {
        try {
            setManualSyncing(true);
            toast.message("Manual sync started", { description: "Fetching recent Started orders from Inflow." });
            const res = await apiClient.post("/system/sync");
            toast.success("Manual sync completed", { description: res.data?.message || undefined });
        } catch (error: any) {
            toast.error("Manual sync failed", { description: error?.response?.data?.error || "Please try again." });
        } finally {
            setManualSyncing(false);
        }
    };

    const handleAddCanopyOrders = () => {
        const { valid, invalid } = parseCanopyOrders(canopyInput);
        if (valid.length === 0) {
            toast.error("Enter a 4-digit order number to add");
            return;
        }

        setCanopyOrders((prev) => {
            const next = [...prev];
            valid.forEach((order) => {
                if (!next.includes(order)) {
                    next.push(order);
                }
            });
            return next;
        });

        if (invalid.length > 0) {
            toast.error("Ignored invalid entries", { description: invalid.join(", ") });
        }

        setCanopyInput("");
        setCanopyError(null);
        setCanopyResult(null);
    };

    const handleRemoveCanopyOrder = (order: string) => {
        setCanopyOrders((prev) => prev.filter((item) => item !== order));
    };

    const handleClearCanopyOrders = () => {
        setCanopyOrders([]);
        setCanopyResult(null);
        setCanopyError(null);
    };

    const handleUploadCanopyOrders = async () => {
        if (canopyOrders.length === 0) {
            toast.error("Add at least one order before uploading");
            return;
        }

        setCanopyUploading(true);
        setCanopyError(null);

        try {
            const response = await apiClient.post("/system/canopyorders/upload", {
                orders: canopyOrders,
            });
            setCanopyResult(response.data);
            toast.success("Canopy orders uploaded", {
                description: response.data?.uploaded_url || undefined,
            });
            setCanopyOrders([]);
        } catch (error: any) {
            const message = error?.response?.data?.error || "Upload failed. Please try again.";
            setCanopyError(message);
            toast.error("Canopy upload failed", { description: message });
        } finally {
            setCanopyUploading(false);
        }
    };

    const webhookEmptyState = (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-medium text-slate-700">No webhooks registered</p>
            <p className="text-xs text-slate-500 mt-1">Register a webhook to receive real-time Inflow events.</p>
        </div>
    );

    return (
        <div className="container mx-auto py-6 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin</h1>
                    <p className="text-sm text-slate-500">System status, notification switches, and operational tools.</p>
                </div>
                <div className="flex items-center gap-2">
                    {user?.email && <span className="text-xs text-slate-500">Signed in as {user.email}</span>}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void loadSystemStatus();
                            void loadSystemSettings();
                            void loadInflowWebhooks();
                            toast.message("Refreshing admin data");
                        }}
                        className="btn-lift"
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    <TabsTrigger value="operations">Operations</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-6">
                    <Card className="border-slate-200">
                        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="text-base">System Status</CardTitle>
                                <CardDescription>High-level health and configuration signals.</CardDescription>
                            </div>
                            {activeWebhook ? (
                                <Badge variant="success">Webhook active</Badge>
                            ) : (
                                <Badge variant="warning">Webhook not registered</Badge>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {systemStatusList.map((feature) => (
                                    <Card key={feature.name} className="border-slate-200 shadow-none">
                                        <CardHeader className="p-4 pb-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <CardTitle className="text-sm">{feature.name}</CardTitle>
                                                    {feature.details && (
                                                        <CardDescription className="mt-1">{feature.details}</CardDescription>
                                                    )}
                                                </div>
                                                <Badge variant={getStatusBadgeVariant(feature.status)}>{feature.status}</Badge>
                                            </div>
                                        </CardHeader>
                                        {feature.error && (
                                            <CardContent className="p-4 pt-0">
                                                <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                                                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                                                    <p className="text-sm text-destructive">{feature.error}</p>
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="notifications" className="mt-4 space-y-6">
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-base">Notification Settings</CardTitle>
                            <CardDescription>Enable or disable services. Core configuration is managed via environment variables.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {([
                                {
                                    key: "email_notifications_enabled",
                                    title: "Email Notifications",
                                },
                                {
                                    key: "teams_recipient_notifications_enabled",
                                    title: "Teams Recipient Notifications",
                                },
                            ] as const).map(({ key, title }) => {
                                const settingsLoading = systemSettings === null;
                                const current = getSetting(systemSettings, key);
                                const enabled = settingsLoading ? false : current.value === "true";
                                const busy = togglingSettingKey === key;
                                return (
                                    <div
                                        key={key}
                                        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-slate-900">{title}</p>
                                                <Badge variant={settingsLoading ? "outline" : enabled ? "success" : "secondary"}>
                                                    {settingsLoading ? "Loading" : enabled ? "Enabled" : "Disabled"}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-slate-500 mt-1">{current.description}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={settingsLoading ? "outline" : enabled ? "outline" : "default"}
                                            disabled={settingsLoading || busy}
                                            onClick={() => handleToggleSetting(key, current.value)}
                                            className="btn-lift"
                                        >
                                            {busy || settingsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {settingsLoading ? "Loading" : enabled ? "Disable" : "Enable"}
                                        </Button>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="operations" className="mt-4 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <Card className="border-slate-200">
                            <CardHeader>
                                <CardTitle className="text-base">Service Testing</CardTitle>
                                <CardDescription>Trigger test sends and verify connectivity.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">Recipient email</label>
                                    <input
                                        type="email"
                                        placeholder="recipient@tamu.edu"
                                        value={testEmailAddress}
                                        onChange={(e) => setTestEmailAddress(e.target.value)}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <Button
                                            onClick={handleTestEmail}
                                            disabled={testingService !== null}
                                            variant="default"
                                            className="btn-lift"
                                        >
                                            {testingService === "email" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                                            {testingService === "email" ? "Sending..." : "Test Email"}
                                        </Button>
                                        <Button
                                            onClick={handleTestTeamsRecipient}
                                            disabled={testingService !== null}
                                            variant="secondary"
                                            className="btn-lift"
                                        >
                                            {testingService === "teams" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                                            {testingService === "teams" ? "Queueing..." : "Test Teams"}
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-medium text-slate-900">System Connections</p>
                                    <p className="text-xs text-slate-500 mt-1">Smoke-test backend connectivity.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                                        <Button
                                            onClick={handleTestInflow}
                                            disabled={testingService !== null}
                                            variant="outline"
                                            className="btn-lift"
                                        >
                                            {testingService === "inflow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {testingService === "inflow" ? "Testing..." : "Test Inflow"}
                                        </Button>
                                        <Button
                                            onClick={handleTestSharePoint}
                                            disabled={testingService !== null}
                                            variant="outline"
                                            className="btn-lift"
                                        >
                                            {testingService === "sharepoint" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {testingService === "sharepoint" ? "Testing..." : "Test SharePoint"}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-slate-200">
                            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <CardTitle className="text-base">Manual Order Sync</CardTitle>
                                    <CardDescription>Fetch recent Started orders from Inflow.</CardDescription>
                                </div>
                                <Button
                                    onClick={() => setSyncDialogOpen(true)}
                                    disabled={manualSyncing}
                                    className="btn-lift"
                                >
                                    {manualSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Sync now
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                    This triggers a backend sync and may take a moment depending on queue size.
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="border-slate-200">
                        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <CardTitle className="text-base">Canopy Orders Upload</CardTitle>
                                <CardDescription>Upload Canopy order numbers to legacy WebDAV and notify Teams.</CardDescription>
                            </div>
                            <Button
                                onClick={() => setCanopyDialogOpen(true)}
                                disabled={canopyUploading || canopyOrders.length === 0}
                                className="btn-lift"
                            >
                                {canopyUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Upload orders
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-700">Order numbers</label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                        type="text"
                                        placeholder="1234, TH5678"
                                        value={canopyInput}
                                        onChange={(e) => setCanopyInput(e.target.value)}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <Button type="button" variant="secondary" onClick={handleAddCanopyOrders} className="btn-lift">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add
                                    </Button>
                                </div>
                                <p className="text-xs text-slate-500">Enter 4-digit order numbers; TH prefix is optional.</p>
                            </div>

                            {canopyOrders.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
                                    No orders added yet.
                                </div>
                            ) : (
                                <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                                    {canopyOrders.map((order) => (
                                        <div key={order} className="flex items-center justify-between px-4 py-2 text-sm">
                                            <span className="font-medium text-slate-900">{order}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveCanopyOrder(order)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-slate-600">{canopyOrders.length} order(s) ready</p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleClearCanopyOrders}
                                    disabled={canopyOrders.length === 0 && !canopyResult && !canopyError}
                                >
                                    Clear list
                                </Button>
                            </div>

                            {canopyError ? (
                                <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                                    <span>{canopyError}</span>
                                </div>
                            ) : null}

                            {canopyResult ? (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                                    <div className="font-medium">Upload complete</div>
                                    <div className="text-xs text-emerald-700 mt-1">
                                        File {canopyResult.filename} ({canopyResult.count} orders)
                                    </div>
                                    <div className="text-xs text-emerald-700 mt-1">
                                        Teams notified: {canopyResult.teams_notified ? "Yes" : "No"}
                                    </div>
                                    {canopyResult.uploaded_url ? (
                                        <a
                                            href={canopyResult.uploaded_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-emerald-800 underline mt-1 inline-block"
                                        >
                                            {canopyResult.uploaded_url}
                                        </a>
                                    ) : null}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <CardTitle className="text-base">Inflow Webhooks</CardTitle>
                                <CardDescription>Manage active webhook registrations.</CardDescription>
                            </div>
                            <Button
                                onClick={handleAutoRegisterWebhook}
                                disabled={registeringWebhook}
                                className="btn-lift"
                            >
                                {registeringWebhook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Register default webhook
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {inflowWebhooks.length === 0 ? (
                                webhookEmptyState
                            ) : (
                                <div className="rounded-lg border border-slate-200 bg-white">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Status</TableHead>
                                                <TableHead>URL</TableHead>
                                                <TableHead className="hidden md:table-cell">Events</TableHead>
                                                <TableHead className="hidden md:table-cell">Failures</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {inflowWebhooks.map((wh) => (
                                                <TableRow key={wh.webhook_id}>
                                                    <TableCell>
                                                        <Badge
                                                            variant={
                                                                wh.status === "active"
                                                                    ? "success"
                                                                    : wh.status === "error"
                                                                      ? "destructive"
                                                                      : "secondary"
                                                            }
                                                        >
                                                            {wh.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="max-w-[18rem] sm:max-w-[28rem]">
                                                        <div className="truncate text-sm text-slate-900" title={wh.url}>
                                                            {wh.url}
                                                        </div>
                                                        <div className="text-xs text-slate-500">ID {wh.webhook_id}</div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <span className="text-sm text-slate-700">
                                                            {Array.isArray(wh.events) ? wh.events.length : 0}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <span className="text-sm text-slate-700">{wh.failure_count ?? 0}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={() => setWebhookToDelete(wh)}
                                                            disabled={deletingWebhookId !== null}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
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
                </TabsContent>
            </Tabs>

            <Dialog open={canopyDialogOpen} onOpenChange={setCanopyDialogOpen}>
                <DialogContent
                    onOpenAutoFocus={(e) => {
                        e.preventDefault();
                        canopyCancelButtonRef.current?.focus();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Upload Canopy orders?</DialogTitle>
                        <DialogDescription>
                            This will upload the current list and notify Teams once complete.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="font-medium text-slate-900">{canopyOrders.length} order(s)</div>
                        <div className="text-xs text-slate-500 mt-1">
                            {canopyOrders.join(", ") || "No orders added"}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            ref={canopyCancelButtonRef}
                            type="button"
                            variant="outline"
                            onClick={() => setCanopyDialogOpen(false)}
                            disabled={canopyUploading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                setCanopyDialogOpen(false);
                                void handleUploadCanopyOrders();
                            }}
                            disabled={canopyUploading || canopyOrders.length === 0}
                        >
                            {canopyUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Upload
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={webhookToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setWebhookToDelete(null);
                }}
            >
                <DialogContent
                    onOpenAutoFocus={(e) => {
                        e.preventDefault();
                        deleteCancelButtonRef.current?.focus();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Delete webhook?</DialogTitle>
                        <DialogDescription>
                            This will stop receiving Inflow events for the selected webhook. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    {webhookToDelete ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                            <div className="font-medium text-slate-900">{webhookToDelete.url}</div>
                            <div className="text-xs text-slate-500 mt-1">ID {webhookToDelete.webhook_id}</div>
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button
                            ref={deleteCancelButtonRef}
                            type="button"
                            variant="outline"
                            onClick={() => setWebhookToDelete(null)}
                            disabled={deletingWebhookId !== null}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void confirmDeleteWebhook()}
                            disabled={deletingWebhookId !== null}
                        >
                            {deletingWebhookId !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
                <DialogContent
                    onOpenAutoFocus={(e) => {
                        e.preventDefault();
                        syncCancelButtonRef.current?.focus();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Run manual order sync?</DialogTitle>
                        <DialogDescription>
                            This will fetch recent Started orders from Inflow. Use this if automated sync is delayed.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            ref={syncCancelButtonRef}
                            type="button"
                            variant="outline"
                            onClick={() => setSyncDialogOpen(false)}
                            disabled={manualSyncing}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                setSyncDialogOpen(false);
                                void runManualSync();
                            }}
                            disabled={manualSyncing}
                        >
                            {manualSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Start sync
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
