import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { settingsApi } from "../api/settings";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { SettingsHeader } from "../components/settings/SettingsHeader";
import { SettingsTabs } from "../components/settings/SettingsTabs";
import { SystemHealthCard } from "../components/settings/SystemHealthCard";
import { IntegrationSmokeTestsCard } from "../components/settings/IntegrationSmokeTestsCard";
import { WebhookManagementCard } from "../components/settings/WebhookManagementCard";
import { PrintQueueCard } from "../components/settings/PrintQueueCard";
import { RecoveryCard } from "../components/settings/RecoveryCard";
import { OperatorOverrideCard } from "../components/settings/OperatorOverrideCard";

export default function Settings() {
    const { isLoading: authLoading } = useAuth();

    const syncHealthQuery = useQuery({
        queryKey: ["settings", "sync-health"],
        queryFn: async () => settingsApi.getSyncHealth(),
        refetchInterval: 60_000,
    });
    const systemStatusQuery = useQuery({
        queryKey: ["settings", "system-status"],
        queryFn: async () => settingsApi.getSystemStatus(),
        refetchInterval: 60_000,
    });

    if (authLoading) {
        return (
            <div className="container mx-auto py-8">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading settings...
                </div>
            </div>
        );
    }

    const overview = (
        <div className="grid gap-6 xl:grid-cols-[1.22fr_0.78fr]">
            <div className="space-y-6">
                <SystemHealthCard
                    syncHealth={syncHealthQuery.data}
                    systemStatus={systemStatusQuery.data}
                    isLoading={systemStatusQuery.isLoading}
                    isError={systemStatusQuery.isError}
                    errorMessage={systemStatusQuery.error instanceof Error ? systemStatusQuery.error.message : undefined}
                    onRetry={() => void systemStatusQuery.refetch()}
                />
                <IntegrationSmokeTestsCard />
                <RecoveryCard />
            </div>

            <div className="space-y-6">
                <WebhookManagementCard />
                <PrintQueueCard />
                <Card className="border-border/70 bg-card/70">
                    <CardContent className="space-y-2 p-5">
                        <p className="text-sm font-medium">What belongs here</p>
                        <p className="text-sm text-muted-foreground">
                            Use settings for temporary recovery, verification, and operational checks. Durable workflow policy and access control
                            stay on /admin.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );

    const advanced = (
        <div className="space-y-6">
            <OperatorOverrideCard />
            <Card className="border-border/70 bg-card/70">
                <CardContent className="space-y-2 p-5">
                    <p className="text-sm font-medium">Advanced recovery guidance</p>
                    <p className="text-sm text-muted-foreground">
                        These actions are intentionally separated from the default view. Use them only when you need to repair workflow state
                        or unblock a specific order.
                    </p>
                </CardContent>
            </Card>
        </div>
    );

    return (
        <div className="relative mx-auto w-full max-w-7xl space-y-6 py-6 sm:py-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top_left,rgba(194,154,74,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(89,76,54,0.14),transparent_32%)]" />

            <SettingsHeader syncHealth={syncHealthQuery.data} systemStatus={systemStatusQuery.data} />

            <SettingsTabs overview={overview} advanced={advanced} />
        </div>
    );
}
