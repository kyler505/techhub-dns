import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { settingsApi, type SystemSettingValue, type SystemSettings } from "../api/settings";
import { useAuth } from "../contexts/AuthContext";
import { SectionErrorBoundary } from "../components/error-boundaries/AppErrorBoundaries";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { extractApiErrorMessage } from "../utils/apiErrors";
import { getUserDisplayName } from "../utils/userDisplay";

const settingsQueryKeys = {
    all: ["settings"] as const,
    systemSettings: () => [...settingsQueryKeys.all, "system-settings"] as const,
};

const AdminsTab = lazy(() => import("../components/admin/AdminsTab"));

const SETTINGS: Array<{
    key: keyof SystemSettings;
    title: string;
    description: string;
}> = [
    {
        key: "email_notifications_enabled",
        title: "Email Notifications",
        description: "Enable or disable outbound email notifications.",
    },
    {
        key: "teams_recipient_notifications_enabled",
        title: "Teams Recipient Notifications",
        description: "Enable or disable recipient-specific Teams notifications.",
    },
    {
        key: "picklist_auto_print_enabled",
        title: "Picklist Auto-Print",
        description: "Control whether the picklist print workflow runs automatically.",
    },
];

const DEFAULT_SETTING: SystemSettingValue = {
    value: "false",
    description: "Loading...",
    updated_at: null,
    updated_by: null,
};

const getSetting = (settings: SystemSettings | null, key: keyof SystemSettings) => settings?.[key] ?? DEFAULT_SETTING;

export default function Settings() {
    const { user, isAdmin, isLoading: authLoading } = useAuth();
    const queryClient = useQueryClient();
    const [togglingKey, setTogglingKey] = useState<keyof SystemSettings | null>(null);

    const currentUserLabel = getUserDisplayName(user, "you");

    const systemSettingsQuery = useQuery({
        queryKey: settingsQueryKeys.systemSettings(),
        enabled: isAdmin && !authLoading,
        queryFn: () => settingsApi.getSettings(),
    });

    const updateSettingMutation = useMutation({
        mutationFn: async ({ key, value }: { key: keyof SystemSettings; value: string }) =>
            settingsApi.updateSetting(key, value, user?.email),
        onMutate: ({ key }) => {
            setTogglingKey(key);
        },
        onSuccess: (_result, variables) => {
            queryClient.setQueryData<SystemSettings | undefined>(settingsQueryKeys.systemSettings(), (current) => {
                if (!current) return current;
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
            toast.error("Failed to update setting", { description: extractApiErrorMessage(error, "Please try again.") });
        },
        onSettled: () => {
            setTogglingKey(null);
        },
    });

    const systemSettings = systemSettingsQuery.data ?? null;
    const loading = systemSettingsQuery.isPending && isAdmin && !authLoading;

    const toggleSetting = async (key: keyof SystemSettings, currentValue: string) => {
        try {
            const nextValue = currentValue === "true" ? "false" : "true";
            await updateSettingMutation.mutateAsync({ key, value: nextValue });
        } catch {
            // handled by mutation callbacks
        }
    };

    if (authLoading || loading) {
        return (
            <div className="container mx-auto py-6 space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground">Loading persistent configuration.</p>
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
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground">Persistent configuration for notifications and admin access.</p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Access denied</CardTitle>
                        <CardDescription>Admin access is required to view this page.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">{currentUserLabel ? `Signed in as ${currentUserLabel}.` : "You are not signed in."}</CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground">Persistent configuration only: notifications, auto-print, and admin allowlist.</p>
                </div>
                {currentUserLabel ? <span className="text-xs text-muted-foreground">Signed in as {currentUserLabel}</span> : null}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Persistent Configuration</CardTitle>
                    <CardDescription>These values are stored in the system settings table and survive restarts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {SETTINGS.map(({ key, title, description }) => {
                        const current = getSetting(systemSettings, key);
                        const enabled = current.value === "true";
                        const busy = togglingKey === key;

                        return (
                            <div key={key} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-foreground">{title}</p>
                                        <Badge variant={enabled ? "success" : "secondary"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Updated {current.updated_at ? new Date(current.updated_at).toLocaleString() : "never"}
                                        {current.updated_by ? ` by ${current.updated_by}` : ""}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={enabled ? "outline" : "default"}
                                    disabled={busy}
                                    onClick={() => void toggleSetting(key, current.value)}
                                    className="btn-lift"
                                >
                                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {enabled ? "Disable" : "Enable"}
                                </Button>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            <SectionErrorBoundary title="Admin allowlist failed" message="Try reloading the admin allowlist panel.">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Admin Allowlist</CardTitle>
                        <CardDescription>Manage which users can access admin capabilities.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Suspense
                            fallback={
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading admin allowlist...
                                        </div>
                                    </CardContent>
                                </Card>
                            }
                        >
                            <AdminsTab />
                        </Suspense>
                    </CardContent>
                </Card>
            </SectionErrorBoundary>
        </div>
    );
}
