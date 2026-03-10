import { useMemo, useRef, useState, useEffect, lazy, Suspense } from "react";
import { toast } from "sonner";
import { inflowApi, WebhookResponse } from "../api/inflow";
import { apiClient } from "../api/client";
import { observabilityApi, RuntimeSummaryResponse } from "../api/observability";
import {
    CanopyOrdersBypassUploadResult,
    PrintJobRecord,
    settingsApi,
    SystemSettings,
} from "../api/settings";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
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
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Trash2, Zap } from "lucide-react";

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

const FlowTab = lazy(() => import("../components/admin/FlowTab"));
const AdminsTab = lazy(() => import("../components/admin/AdminsTab"));

// Default values when settings haven't been loaded yet
const DEFAULT_SETTING = { value: "true", description: "Loading...", updated_at: null, updated_by: null };

// Helper to safely get a setting value
const getSetting = (settings: SystemSettings | null, key: keyof SystemSettings) => {
    return settings?.[key] ?? DEFAULT_SETTING;
};

const normalizeCanopyOrdersBypassValue = (rawValue: string) => {
    const trimmed = rawValue.trim();
    const compact = trimmed.toUpperCase().replace(/\s+/g, "");
    if (/^\d{4}$/.test(compact)) return `TH${compact}`;
    if (/^TH\d{4}$/.test(compact)) return `TH${compact.slice(2)}`;
    return trimmed;
};

const parseCanopyOrdersBypassInput = (input: string) => {
    const candidates = input
        .split(/\r?\n/)
        .flatMap((line) => line.split(","))
        .map((value) => value.trim())
        .filter(Boolean);

    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const value of candidates) {
        const normalizedValue = normalizeCanopyOrdersBypassValue(value);
        if (seen.has(normalizedValue)) continue;
        seen.add(normalizedValue);
        normalized.push(normalizedValue);
    }
    return normalized;
};

const formatTimestamp = (value?: string | null) => {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const getPrintJobBadgeVariant = (status: string): "success" | "destructive" | "secondary" => {
    if (status === "completed") return "success";
    if (status === "failed") return "destructive";
    return "secondary";
};

export default function Admin() {
    const { user, isAdmin, isLoading: authLoading } = useAuth();
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [runtimeSummary, setRuntimeSummary] = useState<RuntimeSummaryResponse | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [runtimeSummaryLoading, setRuntimeSummaryLoading] = useState(false);

    const [activeTab, setActiveTab] = useState<"overview" | "notifications" | "operations" | "admins" | "flow">("overview");

    // Inflow webhook state
    const [inflowWebhooks, setInflowWebhooks] = useState<WebhookResponse[]>([]);
    const [registeringWebhook, setRegisteringWebhook] = useState(false);
    const [deletingWebhookId, setDeletingWebhookId] = useState<string | null>(null);
    const [webhookToDelete, setWebhookToDelete] = useState<WebhookResponse | null>(null);

    // Testing state
    const [testEmailAddress, setTestEmailAddress] = useState("");
    const [testingService, setTestingService] = useState<string | null>(null);

    const [canopyBypassInput, setCanopyBypassInput] = useState("");
    const canopyBypassOrders = useMemo(() => parseCanopyOrdersBypassInput(canopyBypassInput), [canopyBypassInput]);
    const [canopyBypassConfirmOpen, setCanopyBypassConfirmOpen] = useState(false);
    const [canopyBypassUploading, setCanopyBypassUploading] = useState(false);
    const [canopyBypassResult, setCanopyBypassResult] = useState<CanopyOrdersBypassUploadResult | null>(null);
    const [canopyBypassError, setCanopyBypassError] = useState<string | null>(null);

    const [togglingSettingKey, setTogglingSettingKey] = useState<string | null>(null);
    const [syncDialogOpen, setSyncDialogOpen] = useState(false);
    const [manualSyncing, setManualSyncing] = useState(false);
    const [printJobs, setPrintJobs] = useState<PrintJobRecord[]>([]);
    const [printJobsLoading, setPrintJobsLoading] = useState(false);
    const [retryingPrintOrderId, setRetryingPrintOrderId] = useState<string | null>(null);

    const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const syncCancelButtonRef = useRef<HTMLButtonElement | null>(null);

    const autoPrintSetting = getSetting(systemSettings, "picklist_auto_print_enabled");
    const autoPrintEnabled = autoPrintSetting.value === "true";
    const printJobStats = useMemo(() => {
        const pending = printJobs.filter((job) => job.status === "pending" || job.status === "claimed").length;
        const failed = printJobs.filter((job) => job.status === "failed").length;
        const completed = printJobs.filter((job) => job.status === "completed").length;
        return {
            total: printJobs.length,
            pending,
            failed,
            completed,
        };
    }, [printJobs]);

    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }

        void loadSystemStatus();
        void loadRuntimeSummary();
        void loadInflowWebhooks();
        void loadSystemSettings();
        void loadPrintJobs();
    }, [isAdmin]);

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

    const loadRuntimeSummary = async () => {
        setRuntimeSummaryLoading(true);
        try {
            const summary = await observabilityApi.getRuntimeSummary();
            setRuntimeSummary(summary);
        } catch (error) {
            console.error("Failed to load runtime summary:", error);
            toast.error("Failed to load runtime diagnostics.");
        } finally {
            setRuntimeSummaryLoading(false);
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

    const loadPrintJobs = async () => {
        setPrintJobsLoading(true);
        try {
            const response = await settingsApi.getPrintJobs(undefined, 20);
            setPrintJobs(response.jobs);
        } catch (error) {
            console.error("Failed to load print jobs:", error);
            toast.error("Failed to load picklist print jobs.");
        } finally {
            setPrintJobsLoading(false);
        }
    };

    const handleToggleSetting = async (key: string, currentValue: string) => {
        const newValue = currentValue === "true" ? "false" : "true";
        try {
            setTogglingSettingKey(key);
            await settingsApi.updateSetting(key, newValue, user?.email);
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

    const handleRetryPrintJob = async (orderId: string) => {
        setRetryingPrintOrderId(orderId);
        try {
            await settingsApi.retryPicklistPrint(orderId);
            toast.success("Picklist reprint queued");
            await loadPrintJobs();
        } catch (error: any) {
            console.error("Failed to queue picklist reprint:", error);
            toast.error("Failed to queue picklist reprint", {
                description: error.response?.data?.error || "Please try again.",
            });
        } finally {
            setRetryingPrintOrderId(null);
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

    const runCanopyBypassUpload = async () => {
        if (canopyBypassOrders.length === 0) {
            toast.error("Enter at least one order value");
            return;
        }

        setCanopyBypassUploading(true);
        setCanopyBypassError(null);
        setCanopyBypassResult(null);
        try {
            const result = await settingsApi.uploadCanopyOrdersBypass(canopyBypassOrders);
            setCanopyBypassResult(result);
            if (result.success) {
                toast.success("Upload complete", { description: result.filename ?? undefined });
            } else {
                const message = result.error || "Upload failed";
                setCanopyBypassError(message);
                toast.error("Upload failed", { description: message });
            }
        } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || "Upload failed";
            setCanopyBypassError(message);
            toast.error("Upload failed", { description: message });
        } finally {
            setCanopyBypassUploading(false);
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

    const runtimeCards = useMemo(() => {
        if (!runtimeSummary) return [];

        return [
            {
                title: "Sessions",
                value: runtimeSummary.workload.active_sessions,
                details: `${runtimeSummary.workload.active_delivery_runs} active delivery runs`,
            },
            {
                title: "Open Orders",
                value: runtimeSummary.workload.open_orders,
                details: runtimeSummary.inflow.active_webhook ? "Webhook active" : "Webhook inactive",
            },
            {
                title: "Polling Mode",
                value:
                    runtimeSummary.inflow.effective_poll_interval_minutes === null
                        ? "Off"
                        : `${runtimeSummary.inflow.effective_poll_interval_minutes} min`,
                details: runtimeSummary.inflow.active_webhook ? "Webhook backup mode" : "Primary polling mode",
            },
            {
                title: "DB Pool",
                value: `${runtimeSummary.database.pool_size ?? "-"}/${runtimeSummary.database.max_overflow ?? "-"}`,
                details: `${runtimeSummary.database.database_backend.toUpperCase()} pool / overflow`,
            },
        ];
    }, [runtimeSummary]);

    const runtimeGeneratedLabel = useMemo(() => {
        if (!runtimeSummary?.generated_at) return null;
        const generated = new Date(runtimeSummary.generated_at);
        if (Number.isNaN(generated.getTime())) return runtimeSummary.generated_at;
        return generated.toLocaleString();
    }, [runtimeSummary]);

    if (authLoading || loading) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin</h1>
                    <p className="text-sm text-muted-foreground">Loading system configuration and diagnostics.</p>
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

    if (!isAdmin) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin</h1>
                    <p className="text-sm text-muted-foreground">Restricted tools and diagnostics.</p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Access denied</CardTitle>
                        <CardDescription>Admin access is required to view this page.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        {user?.email ? `Signed in as ${user.email}.` : "You are not signed in."}
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

    const webhookEmptyState = (
        <div className="rounded-lg border border-dashed bg-card p-6 text-center">
            <p className="text-sm font-medium text-foreground">No webhooks registered</p>
            <p className="text-xs text-muted-foreground mt-1">Register a webhook to receive real-time Inflow events.</p>
        </div>
    );

    return (
        <div className="container mx-auto py-6 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin</h1>
                    <p className="text-sm text-muted-foreground">System status, notification switches, and operational tools.</p>
                </div>
                <div className="flex items-center gap-2">
                    {user?.email && <span className="text-xs text-muted-foreground">Signed in as {user.email}</span>}
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
                        <TabsTrigger value="admins">Admins</TabsTrigger>
                        <TabsTrigger value="flow">Flow</TabsTrigger>
                    </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-6">
                    <Card>
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
                                    <Card key={feature.name} className="shadow-none">
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

                    <Card>
                        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <CardTitle className="text-base">Runtime Summary</CardTitle>
                                <CardDescription>Live workload, polling, database, and admin throttle state.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                {runtimeGeneratedLabel ? (
                                    <span className="text-xs text-muted-foreground">Updated {runtimeGeneratedLabel}</span>
                                ) : null}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void loadRuntimeSummary()}
                                    disabled={runtimeSummaryLoading}
                                    className="btn-lift"
                                >
                                    {runtimeSummaryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Refresh summary
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {runtimeSummary ? (
                                <>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        {runtimeCards.map((item) => (
                                            <div key={item.title} className="rounded-lg border bg-muted/30 p-4">
                                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.title}</div>
                                                <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">{item.details}</div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                        <div className="rounded-lg border bg-card p-4">
                                            <div className="text-sm font-medium text-foreground">Integration Runtime</div>
                                            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Webhook ID</span>
                                                    <span className="text-right text-foreground">{runtimeSummary.inflow.webhook_id ?? "None"}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Last webhook event</span>
                                                    <span className="text-right text-foreground">{runtimeSummary.inflow.last_webhook_received_at ? new Date(runtimeSummary.inflow.last_webhook_received_at).toLocaleString() : "Never"}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>CORS origins</span>
                                                    <span className="text-right text-foreground">{runtimeSummary.app.cors_allowed_origins.join(", ")}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-lg border bg-card p-4">
                                            <div className="text-sm font-medium text-foreground">Admin Throttles</div>
                                            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Window</span>
                                                    <span className="text-right text-foreground">{runtimeSummary.rate_limits.window_seconds}s</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Read limit</span>
                                                    <span className="text-right text-foreground">{runtimeSummary.rate_limits.rules.admin_reads ?? 0}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Write limit</span>
                                                    <span className="text-right text-foreground">{runtimeSummary.rate_limits.rules.admin_writes ?? 0}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Active buckets</span>
                                                    <span className="text-right text-foreground">{Object.keys(runtimeSummary.rate_limits.active_scopes).length}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
                                    Runtime diagnostics unavailable.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="notifications" className="mt-4 space-y-6">
                    <Card>
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
                                        className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-foreground">{title}</p>
                                                <Badge variant={settingsLoading ? "outline" : enabled ? "success" : "secondary"}>
                                                    {settingsLoading ? "Loading" : enabled ? "Enabled" : "Disabled"}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1">{current.description}</p>
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
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Service Testing</CardTitle>
                                <CardDescription>Trigger test sends and verify connectivity.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Recipient email</label>
                                    <Input
                                        type="email"
                                        placeholder="recipient@tamu.edu"
                                        value={testEmailAddress}
                                        onChange={(e) => setTestEmailAddress(e.target.value)}
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

                                <div className="rounded-lg border bg-muted/30 p-4">
                                    <p className="text-sm font-medium text-foreground">System Connections</p>
                                    <p className="text-xs text-muted-foreground mt-1">Smoke-test backend connectivity.</p>
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

                        <Card>
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
                                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                                    This triggers a backend sync and may take a moment depending on queue size.
                                </div>
                                </CardContent>
                            </Card>

                            <Card className="overflow-hidden border-border/70 bg-card/95">
                                <CardHeader className="gap-4 border-b bg-gradient-to-r from-muted/50 via-background to-background">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CardTitle className="text-base tracking-tight">Picklist Print Recovery</CardTitle>
                                                <Badge variant={autoPrintEnabled ? "success" : "secondary"}>
                                                    Auto-print {autoPrintEnabled ? "active" : "paused"}
                                                </Badge>
                                            </div>
                                            <CardDescription className="max-w-2xl">
                                                Monitor the fixed ops print queue, spot failed jobs quickly, and manually requeue a picklist when the first attempt needs help.
                                            </CardDescription>
                                        </div>
                                        <div className="flex flex-col items-stretch gap-2 sm:flex-row lg:items-center">
                                            <Button
                                                variant={autoPrintEnabled ? "outline" : "default"}
                                                size="sm"
                                                className="btn-lift"
                                                onClick={() => handleToggleSetting("picklist_auto_print_enabled", autoPrintSetting.value)}
                                                disabled={togglingSettingKey === "picklist_auto_print_enabled"}
                                            >
                                                {togglingSettingKey === "picklist_auto_print_enabled" ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : null}
                                                {autoPrintEnabled ? "Pause auto-print" : "Enable auto-print"}
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={loadPrintJobs} disabled={printJobsLoading}>
                                                {printJobsLoading ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="mr-2 h-4 w-4" />
                                                )}
                                                Refresh queue
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-5 p-0">
                                    <div className="grid gap-3 px-6 pt-6 md:grid-cols-3">
                                        <div className="rounded-xl border bg-background/70 p-4">
                                            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Queued View</div>
                                            <div className="mt-3 text-2xl font-semibold text-foreground">{printJobStats.total}</div>
                                            <p className="mt-1 text-xs text-muted-foreground">Recent picklist print jobs in the recovery queue.</p>
                                        </div>
                                        <div className="rounded-xl border bg-background/70 p-4">
                                            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                                <Clock className="h-3.5 w-3.5" />
                                                Active
                                            </div>
                                            <div className="mt-3 text-2xl font-semibold text-foreground">{printJobStats.pending}</div>
                                            <p className="mt-1 text-xs text-muted-foreground">Jobs waiting for the desktop agent or currently printing.</p>
                                        </div>
                                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                                            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-destructive">
                                                <AlertCircle className="h-3.5 w-3.5" />
                                                Needs Attention
                                            </div>
                                            <div className="mt-3 text-2xl font-semibold text-foreground">{printJobStats.failed}</div>
                                            <p className="mt-1 text-xs text-muted-foreground">Failed jobs can be retried without regenerating the picklist.</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 border-y bg-muted/20 px-6 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="font-medium text-foreground">Fixed ops desktop workflow</p>
                                            <p className="text-xs text-muted-foreground">
                                                The desktop agent wakes on `print_job_available`, then claims jobs over HTTP with polling as backup.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                            {printJobStats.completed} completed in this recent queue snapshot
                                        </div>
                                    </div>

                                    <div className="px-6 pb-6">
                                        <div className="overflow-hidden rounded-xl border bg-background/80">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Order</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="hidden md:table-cell">Source</TableHead>
                                                        <TableHead className="hidden md:table-cell">Attempts</TableHead>
                                                        <TableHead className="hidden lg:table-cell">Created</TableHead>
                                                        <TableHead className="hidden xl:table-cell">Last Error</TableHead>
                                                        <TableHead className="text-right">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {printJobs.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                                                                No picklist print jobs yet.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        printJobs.map((job) => {
                                                            const isActive = job.status === "pending" || job.status === "claimed";
                                                            const canRetry = !isActive;

                                                            return (
                                                                <TableRow key={job.id} className="align-top">
                                                                    <TableCell className="space-y-1 py-4">
                                                                        <div className="font-medium text-foreground">
                                                                            {job.order_inflow_order_id || job.order_id}
                                                                        </div>
                                                                        <div className="font-mono text-[11px] text-muted-foreground">
                                                                            {job.order_id}
                                                                        </div>
                                                                        <div className="flex flex-wrap gap-2 pt-1 md:hidden">
                                                                            <Badge variant="outline" className="capitalize">
                                                                                {job.trigger_source}
                                                                            </Badge>
                                                                            <span className="text-xs text-muted-foreground">
                                                                                {job.attempt_count} attempt{job.attempt_count === 1 ? "" : "s"}
                                                                            </span>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="py-4">
                                                                        <div className="flex items-center gap-2">
                                                                            {job.status === "completed" ? (
                                                                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                                            ) : job.status === "failed" ? (
                                                                                <AlertCircle className="h-4 w-4 text-destructive" />
                                                                            ) : (
                                                                                <Clock className="h-4 w-4 text-amber-600" />
                                                                            )}
                                                                            <Badge variant={getPrintJobBadgeVariant(job.status)}>{job.status}</Badge>
                                                                        </div>
                                                                        <div className="mt-2 text-xs text-muted-foreground lg:hidden">
                                                                            {formatTimestamp(job.created_at)}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="hidden py-4 md:table-cell">
                                                                        <Badge variant="outline" className="capitalize">
                                                                            {job.trigger_source}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                                                                        {job.attempt_count}
                                                                    </TableCell>
                                                                    <TableCell className="hidden py-4 text-sm text-muted-foreground lg:table-cell">
                                                                        {formatTimestamp(job.created_at)}
                                                                    </TableCell>
                                                                    <TableCell className="hidden max-w-[18rem] py-4 text-sm text-muted-foreground xl:table-cell">
                                                                        <div className="line-clamp-2" title={job.last_error || undefined}>
                                                                            {job.last_error || "No reported error"}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="py-4 text-right">
                                                                        <Button
                                                                            size="sm"
                                                                            variant={job.status === "failed" ? "default" : "outline"}
                                                                            className="btn-lift"
                                                                            onClick={() => handleRetryPrintJob(job.order_id)}
                                                                            disabled={retryingPrintOrderId === job.order_id || !canRetry}
                                                                        >
                                                                            {retryingPrintOrderId === job.order_id ? (
                                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                            ) : null}
                                                                            Retry Print
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Tag Request Upload (Bypass)</CardTitle>
                                <CardDescription>Uploads order values, bypassing eligibility checks.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Orders</label>
                                    <textarea
                                        value={canopyBypassInput}
                                        onChange={(e) => setCanopyBypassInput(e.target.value)}
                                        className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        rows={6}
                                        placeholder="TH1234\n1235\n..."
                                    />
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-xs text-muted-foreground">
                                            {canopyBypassOrders.length} value{canopyBypassOrders.length === 1 ? "" : "s"}
                                        </p>
                                        <Button
                                            type="button"
                                            className="btn-lift"
                                            disabled={canopyBypassUploading || canopyBypassOrders.length === 0}
                                            onClick={() => setCanopyBypassConfirmOpen(true)}
                                        >
                                            {canopyBypassUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Upload
                                        </Button>
                                    </div>
                                </div>

                                {canopyBypassOrders.length > 0 ? (
                                    <details className="rounded-lg border bg-muted/30 p-3 text-xs">
                                        <summary className="cursor-pointer text-muted-foreground">Preview</summary>
                                        <div className="mt-2 font-mono text-foreground break-words">
                                            {canopyBypassOrders.join(", ")}
                                        </div>
                                    </details>
                                ) : null}

                                {canopyBypassResult?.success ? (
                                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                                        <div className="text-xs text-muted-foreground">Upload</div>
                                        <div className="mt-1">
                                            {canopyBypassResult.uploaded_url ? (
                                                <a
                                                    href={canopyBypassResult.uploaded_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-sm underline break-all"
                                                >
                                                    {canopyBypassResult.filename || canopyBypassResult.uploaded_url}
                                                </a>
                                            ) : (
                                                <span className="text-sm text-foreground">{canopyBypassResult.filename || "(no file)"}</span>
                                            )}
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            Updated {canopyBypassResult.updated_orders ?? 0} · Missing {canopyBypassResult.missing_orders?.length ?? 0}
                                        </div>
                                    </div>
                                ) : null}

                                {canopyBypassError ? (
                                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                                        {canopyBypassError}
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
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
                                <div className="rounded-lg border bg-card">
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
                                                        <div className="truncate text-sm text-foreground" title={wh.url}>
                                                            {wh.url}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">ID {wh.webhook_id}</div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <span className="text-sm text-muted-foreground">
                                                            {Array.isArray(wh.events) ? wh.events.length : 0}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <span className="text-sm text-muted-foreground">{wh.failure_count ?? 0}</span>
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

                <TabsContent value="flow" className="mt-4 space-y-6">
                    <Suspense
                        fallback={
                            <Card>
                                <CardContent className="p-6">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading flow...
                                    </div>
                                </CardContent>
                            </Card>
                        }
                    >
                        <FlowTab />
                    </Suspense>
                </TabsContent>

                <TabsContent value="admins" className="mt-4 space-y-6">
                    <Suspense
                        fallback={
                            <Card>
                                <CardContent className="p-6">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading admins...
                                    </div>
                                </CardContent>
                            </Card>
                        }
                    >
                        <AdminsTab />
                    </Suspense>
                </TabsContent>
            </Tabs>

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
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="font-medium text-foreground">{webhookToDelete.url}</div>
                            <div className="text-xs text-muted-foreground mt-1">ID {webhookToDelete.webhook_id}</div>
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

            <Dialog open={canopyBypassConfirmOpen} onOpenChange={setCanopyBypassConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Upload tag request (bypass)?</DialogTitle>
                        <DialogDescription>Bypasses eligibility checks.</DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Count</div>
                        <div className="mt-1 font-medium text-foreground">{canopyBypassOrders.length}</div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCanopyBypassConfirmOpen(false)} disabled={canopyBypassUploading}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                setCanopyBypassConfirmOpen(false);
                                void runCanopyBypassUpload();
                            }}
                            disabled={canopyBypassUploading || canopyBypassOrders.length === 0}
                        >
                            {canopyBypassUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Upload
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
