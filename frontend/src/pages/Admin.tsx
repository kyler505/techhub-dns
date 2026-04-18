import { useMemo, useRef, useState, lazy, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inflowApi, WebhookResponse } from "../api/inflow";
import { apiClient } from "../api/client";
import { observabilityApi, RuntimeSummaryResponse } from "../api/observability";
import {
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
import { extractApiErrorMessage } from "../utils/apiErrors";
import { shouldThrowToBoundary } from "../utils/apiErrors";
import { ordersQueryKeys } from "../queries/orders";
import { formatToCentralTime } from "../utils/timezone";
import { SectionErrorBoundary } from "../components/error-boundaries/AppErrorBoundaries";

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

const adminQueryKeys = {
    all: ["admin"] as const,
    systemStatus: () => [...adminQueryKeys.all, "system-status"] as const,
    runtimeSummary: () => [...adminQueryKeys.all, "runtime-summary"] as const,
    systemSettings: () => [...adminQueryKeys.all, "system-settings"] as const,
    inflowWebhooks: () => [...adminQueryKeys.all, "inflow-webhooks"] as const,
    printJobs: () => [...adminQueryKeys.all, "print-jobs"] as const,
};

const FALLBACK_SYSTEM_STATUS: SystemStatus = {
    saml_auth: { name: "TAMU SSO", enabled: false, configured: false, status: "disabled" },
    graph_api: { name: "Microsoft Graph", enabled: false, configured: false, status: "disabled" },
    sharepoint: { name: "SharePoint Storage", enabled: true, configured: true, status: "active" },
    inflow_sync: { name: "Inflow Sync", enabled: true, configured: true, status: "active" },
};

const FlowTab = lazy(() => import("../components/admin/FlowTab"));
const AdminsTab = lazy(() => import("../components/admin/AdminsTab"));

// Default values when settings haven't been loaded yet
const DEFAULT_SETTING = { value: "true", description: "Loading...", updated_at: null, updated_by: null };

// Helper to safely get a setting value
const getSetting = (settings: SystemSettings | null, key: keyof SystemSettings) => {
    return settings?.[key] ?? DEFAULT_SETTING;
};


const formatTimestamp = (value?: string | null) => {
    if (!value) return "-";
    return formatToCentralTime(value);
};

const getPrintJobBadgeVariant = (status: string): "success" | "destructive" | "secondary" => {
    if (status === "completed") return "success";
    if (status === "failed") return "destructive";
    return "secondary";
};

interface PrintJobOrderSummary {
    order_id: string;
    order_inflow_order_id?: string | null;
    latest_job_id: string;
    latest_status: string;
    latest_trigger_source: string;
    latest_requested_by?: string | null;
    latest_created_at?: string | null;
    latest_completed_at?: string | null;
    latest_claimed_at?: string | null;
    latest_claim_expires_at?: string | null;
    latest_error?: string | null;
    total_jobs: number;
    failed_jobs: number;
    completed_jobs: number;
    active_jobs: number;
    max_attempt_count: number;
}

export default function Admin() {
    const { user, isAdmin, isLoading: authLoading } = useAuth();
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState<"overview" | "notifications" | "operations" | "admins" | "flow">("overview");

    const [webhookToDelete, setWebhookToDelete] = useState<WebhookResponse | null>(null);

    // Testing state
    const [testEmailAddress, setTestEmailAddress] = useState("");
    const [testingService, setTestingService] = useState<string | null>(null);


    const [syncDialogOpen, setSyncDialogOpen] = useState(false);
    const [manualSyncing, setManualSyncing] = useState(false);

    const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const syncCancelButtonRef = useRef<HTMLButtonElement | null>(null);

    const adminQueriesEnabled = isAdmin && !authLoading;

    const systemStatusQuery = useQuery({
        queryKey: adminQueryKeys.systemStatus(),
        enabled: adminQueriesEnabled,
        queryFn: async (): Promise<SystemStatus> => {
            try {
                const response = await apiClient.get<SystemStatus>("/system/status");
                return response.data;
            } catch (error) {
                console.error("Failed to load system status:", error);
                toast.error("Failed to load system status. Showing last-known defaults.");
                return FALLBACK_SYSTEM_STATUS;
            }
        },
    });

    const runtimeSummaryQuery = useQuery({
        queryKey: adminQueryKeys.runtimeSummary(),
        enabled: adminQueriesEnabled,
        throwOnError: shouldThrowToBoundary,
        queryFn: async (): Promise<RuntimeSummaryResponse> => {
            try {
                return await observabilityApi.getRuntimeSummary();
            } catch (error) {
                console.error("Failed to load runtime summary:", error);
                toast.error("Failed to load runtime diagnostics.");
                throw error;
            }
        },
    });

    const systemSettingsQuery = useQuery({
        queryKey: adminQueryKeys.systemSettings(),
        enabled: adminQueriesEnabled,
        throwOnError: shouldThrowToBoundary,
        queryFn: async (): Promise<SystemSettings> => {
            try {
                return await settingsApi.getSettings();
            } catch (error) {
                console.error("Failed to load system settings:", error);
                toast.error("Failed to load notification settings.");
                throw error;
            }
        },
    });

    const inflowWebhooksQuery = useQuery({
        queryKey: adminQueryKeys.inflowWebhooks(),
        enabled: adminQueriesEnabled,
        throwOnError: shouldThrowToBoundary,
        queryFn: async (): Promise<WebhookResponse[]> => {
            try {
                const response = await inflowApi.listWebhooks();
                return response.webhooks;
            } catch (error) {
                console.error("Failed to load Inflow webhooks:", error);
                toast.error("Failed to load Inflow webhooks.");
                throw error;
            }
        },
    });

    const printJobsQuery = useQuery({
        queryKey: adminQueryKeys.printJobs(),
        enabled: adminQueriesEnabled,
        throwOnError: shouldThrowToBoundary,
        queryFn: async (): Promise<PrintJobRecord[]> => {
            try {
                const response = await settingsApi.getPrintJobs(undefined, 20);
                return response.jobs;
            } catch (error) {
                console.error("Failed to load print jobs:", error);
                toast.error("Failed to load picklist print jobs.");
                throw error;
            }
        },
    });

    const systemStatus = systemStatusQuery.data ?? null;
    const runtimeSummary = runtimeSummaryQuery.data ?? null;
    const systemSettings = systemSettingsQuery.data ?? null;
    const inflowWebhooks = inflowWebhooksQuery.data ?? [];
    const printJobs = printJobsQuery.data ?? [];
    const loading =
        adminQueriesEnabled
        && (
            systemStatusQuery.isPending
            || runtimeSummaryQuery.isPending
            || systemSettingsQuery.isPending
            || inflowWebhooksQuery.isPending
            || printJobsQuery.isPending
        );
    const runtimeSummaryLoading = runtimeSummaryQuery.isFetching;
    const printJobsLoading = printJobsQuery.isFetching;

    const toggleSettingMutation = useMutation({
        mutationFn: ({ key, value }: { key: keyof SystemSettings; value: string }) => settingsApi.updateSetting(key, value, user?.email),
        onSuccess: (_data, variables) => {
            queryClient.setQueryData<SystemSettings | undefined>(adminQueryKeys.systemSettings(), (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    [variables.key]: {
                        ...current[variables.key],
                        value: variables.value,
                        updated_at: new Date().toISOString(),
                        updated_by: user?.email ?? null,
                    },
                };
            });
            toast.success("Setting updated", { description: `${variables.key} = ${variables.value}` });
        },
        onError: (error: unknown) => {
            console.error("Failed to update setting:", error);
            toast.error("Failed to update setting", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        },
    });

    const registeringWebhook = false;
    const registerWebhookMutation = useMutation({
        mutationFn: async () => {
            const defaults = await inflowApi.getWebhookDefaults();
            return inflowApi.registerWebhook({
                url: defaults.url || "",
                events: defaults.events || [],
            });
        },
        onSuccess: (webhook) => {
            queryClient.setQueryData<WebhookResponse[] | undefined>(adminQueryKeys.inflowWebhooks(), (current = []) => {
                const withoutExisting = current.filter((item) => item.webhook_id !== webhook.webhook_id);
                return [webhook, ...withoutExisting];
            });
            toast.success("Inflow webhook registered");
        },
        onError: (error: unknown) => {
            console.error("Failed to register webhook:", error);
            toast.error("Failed to register webhook", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        },
    });

    const deletingWebhookId = null;
    const deleteWebhookMutation = useMutation({
        mutationFn: async (webhookId: string) => {
            await inflowApi.deleteWebhook(webhookId);
            return webhookId;
        },
        onSuccess: (webhookId) => {
            queryClient.setQueryData<WebhookResponse[] | undefined>(adminQueryKeys.inflowWebhooks(), (current = []) =>
                current.filter((item) => item.webhook_id !== webhookId)
            );
            toast.success("Webhook deleted");
            setWebhookToDelete(null);
        },
        onError: (error: unknown) => {
            console.error("Failed to delete webhook:", error);
            toast.error("Failed to delete webhook", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        },
    });

    const retryPrintJobMutation = useMutation({
        mutationFn: (orderId: string) => settingsApi.retryPicklistPrint(orderId),
        onSuccess: (response) => {
            queryClient.setQueryData<PrintJobRecord[] | undefined>(adminQueryKeys.printJobs(), (current = []) => {
                const nextJobs = [response.job, ...current.filter((job) => job.id !== response.job.id)];
                return nextJobs.slice(0, 20);
            });
            toast.success("Picklist reprint queued");
        },
        onError: (error: unknown) => {
            console.error("Failed to queue picklist reprint:", error);
            toast.error("Failed to queue picklist reprint", {
                description: extractApiErrorMessage(error, "Please try again."),
            });
        },
    });

    const togglingSettingKey = toggleSettingMutation.isPending ? String(toggleSettingMutation.variables?.key ?? "") : null;
    const retryingPrintOrderId = retryPrintJobMutation.isPending ? retryPrintJobMutation.variables ?? null : null;

    const autoPrintSetting = getSetting(systemSettings, "picklist_auto_print_enabled");
    const autoPrintEnabled = autoPrintSetting.value === "true";
    const printJobSummaries = useMemo<PrintJobOrderSummary[]>(() => {
        const grouped = new Map<string, PrintJobRecord[]>();
        for (const job of printJobs) {
            const existing = grouped.get(job.order_id);
            if (existing) {
                existing.push(job);
            } else {
                grouped.set(job.order_id, [job]);
            }
        }

        return Array.from(grouped.values()).map((jobs) => {
            const sortedJobs = [...jobs].sort((left, right) => {
                const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
                const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
                return rightTime - leftTime;
            });
            const latestJob = sortedJobs[0];
            const failedJobs = sortedJobs.filter((job) => job.status === "failed");
            const completedJobs = sortedJobs.filter((job) => job.status === "completed");
            const activeJobs = sortedJobs.filter((job) => job.status === "pending" || job.status === "claimed");
            const latestErrorJob = failedJobs[0] ?? sortedJobs.find((job) => job.last_error) ?? latestJob;

            return {
                order_id: latestJob.order_id,
                order_inflow_order_id: latestJob.order_inflow_order_id,
                latest_job_id: latestJob.id,
                latest_status: latestJob.status,
                latest_trigger_source: latestJob.trigger_source,
                latest_requested_by: latestJob.requested_by,
                latest_created_at: latestJob.created_at,
                latest_completed_at: latestJob.completed_at,
                latest_claimed_at: latestJob.claimed_at,
                latest_claim_expires_at: latestJob.claim_expires_at,
                latest_error: latestErrorJob?.last_error,
                total_jobs: sortedJobs.length,
                failed_jobs: failedJobs.length,
                completed_jobs: completedJobs.length,
                active_jobs: activeJobs.length,
                max_attempt_count: Math.max(...sortedJobs.map((job) => job.attempt_count || 0), 0),
            };
        });
    }, [printJobs]);
    const printJobStats = useMemo(() => {
        const pending = printJobSummaries.filter((job) => job.latest_status === "pending" || job.latest_status === "claimed").length;
        const failed = printJobSummaries.filter((job) => job.latest_status === "failed").length;
        const completed = printJobSummaries.filter((job) => job.completed_jobs > 0).length;
        return {
            total: printJobSummaries.length,
            pending,
            failed,
            completed,
        };
    }, [printJobSummaries]);

    const loadSystemStatus = async () => {
        await systemStatusQuery.refetch();
    };

    const loadSystemSettings = async () => {
        await systemSettingsQuery.refetch();
    };

    const loadRuntimeSummary = async () => {
        await runtimeSummaryQuery.refetch();
    };

    const loadInflowWebhooks = async () => {
        await inflowWebhooksQuery.refetch();
    };

    const loadPrintJobs = async () => {
        await printJobsQuery.refetch();
    };

    const handleToggleSetting = async (key: keyof SystemSettings, currentValue: string) => {
        const newValue = currentValue === "true" ? "false" : "true";
        try {
            await toggleSettingMutation.mutateAsync({ key, value: newValue });
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const handleAutoRegisterWebhook = async () => {
        try {
            await registerWebhookMutation.mutateAsync();
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const handleRetryPrintJob = async (orderId: string) => {
        try {
            await retryPrintJobMutation.mutateAsync(orderId);
        } catch {
            // Handled by mutation callbacks.
        }
    };

    const handleDeleteInflowWebhook = async (webhookId: string): Promise<boolean> => {
        try {
            await deleteWebhookMutation.mutateAsync(webhookId);
            return true;
        } catch {
            return false;
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
        } catch (error: unknown) {
            toast.error("Test email failed", { description: extractApiErrorMessage(error, "Please try again.") });
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
        } catch (error: unknown) {
            toast.error("Test Teams message failed", {
                description: extractApiErrorMessage(error, "Please try again."),
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
        } catch (error: unknown) {
            toast.error("Inflow connection failed", {
                description: extractApiErrorMessage(error, "Please try again."),
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
        } catch (error: unknown) {
            toast.error("SharePoint connection failed", {
                description: extractApiErrorMessage(error, "Please try again."),
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
        return formatToCentralTime(runtimeSummary.generated_at);
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
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ordersQueryKeys.lists() }),
                queryClient.invalidateQueries({ queryKey: adminQueryKeys.runtimeSummary() }),
                queryClient.invalidateQueries({ queryKey: adminQueryKeys.systemStatus() }),
            ]);
        } catch (error: unknown) {
            toast.error("Manual sync failed", { description: extractApiErrorMessage(error, "Please try again.") });
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
                            void Promise.all([
                                loadSystemStatus(),
                                loadSystemSettings(),
                                loadInflowWebhooks(),
                                loadRuntimeSummary(),
                                loadPrintJobs(),
                            ]);
                            toast.message("Refreshing admin data");
                        }}
                        className="btn-lift"
                        disabled={loading}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>
            </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                    <TabsList className="w-full flex-wrap justify-start">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="notifications">Notifications</TabsTrigger>
                        <TabsTrigger value="operations">Operations</TabsTrigger>
                        <TabsTrigger value="admins">Admins</TabsTrigger>
                        <TabsTrigger value="flow">Flow</TabsTrigger>
                    </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-6">
                    <SectionErrorBoundary
                        title="Runtime diagnostics failed"
                        message="Try reloading the runtime summary panel. The rest of the admin screen is still available."
                    >
                    <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-base font-semibold tracking-tight">System Status</h2>
                                <p className="text-sm text-muted-foreground">High-level health and configuration signals.</p>
                            </div>
                            {activeWebhook ? (
                                <Badge variant="success">Webhook active</Badge>
                            ) : (
                                <Badge variant="warning">Webhook not registered</Badge>
                            )}
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                                                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                                                <p className="text-sm text-destructive">{feature.error}</p>
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="text-base font-semibold tracking-tight">Runtime Summary</h2>
                                <p className="text-sm text-muted-foreground">Live workload, polling, database, and admin throttle state.</p>
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
                        </div>
                        <div className="mt-4 space-y-4">
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
                                                    <span className="text-right text-foreground">{runtimeSummary.inflow.last_webhook_received_at ? formatToCentralTime(runtimeSummary.inflow.last_webhook_received_at) : "Never"}</span>
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
                        </div>
                    </section>
                    </SectionErrorBoundary>
                </TabsContent>

                <TabsContent value="notifications" className="mt-4 space-y-6">
                    <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                        <div className="space-y-2">
                            <h2 className="text-base font-semibold tracking-tight">Notification Settings</h2>
                            <p className="text-sm text-muted-foreground">Enable or disable services. Core configuration is managed via environment variables.</p>
                        </div>
                        <div className="mt-4 space-y-3">
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
                                            <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
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
                        </div>
                    </section>
                </TabsContent>

                <TabsContent value="operations" className="mt-4 space-y-6">
                    <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-2">
                        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                            <div className="space-y-2">
                                <h2 className="text-base font-semibold tracking-tight">Service Testing</h2>
                                <p className="text-sm text-muted-foreground">Trigger test sends and verify connectivity.</p>
                            </div>
                            <div className="mt-4 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Recipient email</label>
                                    <Input
                                        type="email"
                                        placeholder="recipient@tamu.edu"
                                        value={testEmailAddress}
                                        onChange={(e) => setTestEmailAddress(e.target.value)}
                                    />
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                                    <p className="mt-1 text-xs text-muted-foreground">Smoke-test backend connectivity.</p>
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                            </div>
                        </section>

                        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-base font-semibold tracking-tight">Manual Order Sync</h2>
                                    <p className="text-sm text-muted-foreground">Fetch recent Started orders from Inflow.</p>
                                </div>
                                <Button
                                    onClick={() => setSyncDialogOpen(true)}
                                    disabled={manualSyncing}
                                    className="btn-lift"
                                >
                                    {manualSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Sync now
                                </Button>
                            </div>
                            <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                                This triggers a backend sync and may take a moment depending on queue size.
                            </div>
                        </section>
                    </div>

                    <SectionErrorBoundary
                        title="Print recovery panel failed"
                        message="Try reloading the print queue panel. The rest of the admin tools are still available."
                    >
                        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                            <div className="space-y-4 border-b border-border/60 pb-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-base font-semibold tracking-tight">Picklist Print Recovery</h2>
                                            <Badge variant={autoPrintEnabled ? "success" : "secondary"}>
                                                Auto-print {autoPrintEnabled ? "active" : "paused"}
                                            </Badge>
                                        </div>
                                        <p className="max-w-2xl text-sm text-muted-foreground">
                                            Monitor the fixed ops print queue, spot failed jobs quickly, and manually requeue a picklist when the first attempt needs help.
                                        </p>
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
                                        <Button variant="ghost" size="sm" onClick={loadPrintJobs} disabled={printJobsLoading} className="min-h-11">
                                            {printJobsLoading ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                            )}
                                            Refresh queue
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-5 pt-4">
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="rounded-xl border bg-background/70 p-4">
                                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Queued View</div>
                                        <div className="mt-3 text-2xl font-semibold text-foreground">{printJobStats.total}</div>
                                        <p className="mt-1 text-xs text-muted-foreground">Recent orders represented in the picklist print queue.</p>
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
                                        <p className="mt-1 text-xs text-muted-foreground">Orders whose latest print attempt failed and still need a retry.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 border-y bg-muted/20 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
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
                                                printJobSummaries.map((job) => {
                                                    const isActive = job.latest_status === "pending" || job.latest_status === "claimed";
                                                    const canRetry = !isActive;

                                                    return (
                                                        <TableRow key={job.order_id} className="align-top">
                                                            <TableCell className="space-y-1 py-4">
                                                                <div className="font-medium text-foreground">
                                                                    {job.order_inflow_order_id || job.order_id}
                                                                </div>
                                                                <div className="font-mono text-[11px] text-muted-foreground">
                                                                    {job.order_id}
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 pt-1 md:hidden">
                                                                    <Badge variant="outline" className="capitalize">
                                                                        {job.latest_trigger_source}
                                                                    </Badge>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {job.total_jobs} job{job.total_jobs === 1 ? "" : "s"}
                                                                    </span>
                                                                    {job.failed_jobs > 0 ? (
                                                                        <span className="text-xs text-destructive">
                                                                            {job.failed_jobs} fail{job.failed_jobs === 1 ? "" : "s"}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-4">
                                                                <div className="flex items-center gap-2">
                                                                    {job.latest_status === "completed" ? (
                                                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                                    ) : job.latest_status === "failed" ? (
                                                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                                                    ) : (
                                                                        <Clock className="h-4 w-4 text-amber-600" />
                                                                    )}
                                                                    <Badge variant={getPrintJobBadgeVariant(job.latest_status)}>{job.latest_status}</Badge>
                                                                </div>
                                                                <div className="mt-2 text-xs text-muted-foreground lg:hidden">
                                                                    {formatTimestamp(job.latest_created_at)}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="hidden py-4 md:table-cell">
                                                                <Badge variant="outline" className="capitalize">
                                                                    {job.latest_trigger_source}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                                                                <div>{job.max_attempt_count} attempt{job.max_attempt_count === 1 ? "" : "s"}</div>
                                                                <div className="text-xs text-muted-foreground">{job.total_jobs} total job{job.total_jobs === 1 ? "" : "s"}</div>
                                                                {job.failed_jobs > 0 ? (
                                                                    <div className="text-xs text-destructive">{job.failed_jobs} failed</div>
                                                                ) : null}
                                                            </TableCell>
                                                            <TableCell className="hidden py-4 text-sm text-muted-foreground lg:table-cell">
                                                                {formatTimestamp(job.latest_created_at)}
                                                            </TableCell>
                                                            <TableCell className="hidden max-w-[18rem] py-4 text-sm text-muted-foreground xl:table-cell">
                                                                <div className="line-clamp-2" title={job.latest_error || undefined}>
                                                                    {job.latest_error || "No reported error"}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-4 text-right">
                                                                <Button
                                                                    size="sm"
                                                                    variant={job.latest_status === "failed" ? "default" : "outline"}
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
                        </section>
                    </SectionErrorBoundary>

<SectionErrorBoundary
                        title="Webhook management failed"
                        message="Try reloading the webhook management panel. Other admin tools are still available."
                    >
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
                                {registerWebhookMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                    </SectionErrorBoundary>
                </TabsContent>

                <TabsContent value="flow" className="mt-4 space-y-6">
                    <SectionErrorBoundary
                        title="Flow tools failed"
                        message="Try reloading the flow admin tools."
                    >
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
                    </SectionErrorBoundary>
                </TabsContent>

                <TabsContent value="admins" className="mt-4 space-y-6">
                    <SectionErrorBoundary
                        title="Admin access tools failed"
                        message="Try reloading the admin access tools."
                    >
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
                    </SectionErrorBoundary>
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
                            disabled={deleteWebhookMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void confirmDeleteWebhook()}
                            disabled={deleteWebhookMutation.isPending}
                        >
                            {deleteWebhookMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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