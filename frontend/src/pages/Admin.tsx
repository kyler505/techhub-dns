import { useState, useEffect } from "react";
import { inflowApi, WebhookResponse } from "../api/inflow";
import { apiClient } from "../api/client";
import { settingsApi, SystemSettings } from "../api/settings";
import { useAuth } from "../contexts/AuthContext";

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

// Default values when settings haven't been loaded yet
const DEFAULT_SETTING = { value: "true", description: "Loading...", updated_at: null, updated_by: null };

// Helper to safely get a setting value
const getSetting = (settings: SystemSettings | null, key: keyof SystemSettings) => {
    return settings?.[key] ?? DEFAULT_SETTING;
};

export default function Admin() {
    const { user } = useAuth();
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Inflow webhook state
    const [inflowWebhooks, setInflowWebhooks] = useState<WebhookResponse[]>([]);
    const [registeringWebhook, setRegisteringWebhook] = useState(false);

    // Testing state
    const [testEmailAddress, setTestEmailAddress] = useState("");

    const [testingService, setTestingService] = useState<string | null>(null);

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
            setSystemStatus({
                saml_auth: { name: "TAMU SSO", enabled: false, configured: false, status: "disabled" },
                graph_api: { name: "Microsoft Graph", enabled: false, configured: false, status: "disabled" },
                sharepoint: { name: "SharePoint Storage", enabled: false, configured: false, status: "disabled" },
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
        }
    };

    const loadInflowWebhooks = async () => {
        try {
            const response = await inflowApi.listWebhooks();
            setInflowWebhooks(response.webhooks);
        } catch (error) {
            console.error("Failed to load Inflow webhooks:", error);
        }
    };

    const handleToggleSetting = async (key: string, currentValue: string) => {
        const newValue = currentValue === "true" ? "false" : "true";
        try {
            await settingsApi.updateSetting(key, newValue, user?.email || "admin");
            await loadSystemSettings();
            setMessage({ type: "success", text: `Setting updated: ${key} = ${newValue}` });
        } catch (error: any) {
            console.error("Failed to update setting:", error);
            setMessage({ type: "error", text: error.response?.data?.error || "Failed to update setting" });
        }
    };

    const handleAutoRegisterWebhook = async () => {
        setRegisteringWebhook(true);
        setMessage(null);
        try {
            const defaults = await inflowApi.getWebhookDefaults();
            await inflowApi.registerWebhook({
                url: defaults.url || "",
                events: defaults.events || [],
            });
            setMessage({ type: "success", text: "Inflow webhook registered successfully" });
            await loadInflowWebhooks();
        } catch (error: any) {
            console.error("Failed to register webhook:", error);
            setMessage({
                type: "error",
                text: error.response?.data?.detail || "Failed to register webhook",
            });
        } finally {
            setRegisteringWebhook(false);
        }
    };

    const handleDeleteInflowWebhook = async (webhookId: string) => {
        if (!confirm("Are you sure you want to delete this webhook?")) {
            return;
        }

        try {
            await inflowApi.deleteWebhook(webhookId);
            setMessage({ type: "success", text: "Webhook deleted successfully" });
            await loadInflowWebhooks();
        } catch (error: any) {
            console.error("Failed to delete webhook:", error);
            setMessage({
                type: "error",
                text: error.response?.data?.detail || "Failed to delete webhook",
            });
        }
    };

    // Testing handlers
    const handleTestEmail = async () => {
        if (!testEmailAddress) {
            setMessage({ type: "error", text: "Please enter an email address" });
            return;
        }
        setTestingService("email");
        try {
            const result = await settingsApi.testEmail(testEmailAddress);
            setMessage({ type: result.success ? "success" : "error", text: result.message || result.error || "Unknown result" });
        } catch (error: any) {
            setMessage({ type: "error", text: error.response?.data?.error || "Test email failed" });
        } finally {
            setTestingService(null);
        }
    };


    const handleTestInflow = async () => {
        setTestingService("inflow");
        try {
            const result = await settingsApi.testInflow();
            setMessage({ type: result.success ? "success" : "error", text: result.message || result.error || "Unknown result" });
        } catch (error: any) {
            setMessage({ type: "error", text: error.response?.data?.error || "Test Inflow connection failed" });
        } finally {
            setTestingService(null);
        }
    };

    const handleTestSharePoint = async () => {
        setTestingService("sharepoint");
        try {
            const result = await settingsApi.testSharePoint();
            setMessage({ type: result.success ? "success" : "error", text: result.message || result.error || "Unknown result" });
        } catch (error: any) {
            setMessage({ type: "error", text: error.response?.data?.error || "Test SharePoint connection failed" });
        } finally {
            setTestingService(null);
        }
    };

    const getStatusColor = (status: FeatureStatus["status"]) => {
        switch (status) {
            case "active": return "bg-green-100 border-green-300 text-green-800";
            case "warning": return "bg-yellow-100 border-yellow-300 text-yellow-800";
            case "disabled": return "bg-gray-100 border-gray-300 text-gray-600";
            case "error": return "bg-red-100 border-red-300 text-red-800";
        }
    };

    const getStatusIcon = (status: FeatureStatus["status"]) => {
        switch (status) {
            case "active": return "✓";
            case "warning": return "⚠";
            case "disabled": return "○";
            case "error": return "✕";
        }
    };

    if (loading) {
        return <div className="p-4">Loading...</div>;
    }

    const activeWebhook = inflowWebhooks.find((w) => w.status === "active");

    return (
        <div className="p-4 w-full max-w-4xl mx-auto space-y-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Admin Panel</h1>
                {user && (
                    <span className="text-sm text-gray-500">Logged in as {user.email}</span>
                )}
            </div>

            {/* Message Display - Fixed at top */}
            {message && (
                <div
                    className={`p-3 rounded ${message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                >
                    {message.text}
                    <button onClick={() => setMessage(null)} className="float-right font-bold">×</button>
                </div>
            )}

            {/* Feature Status Grid */}
            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">System Status</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {systemStatus && Object.values(systemStatus).map((feature) => (
                        <div
                            key={feature.name}
                            className={`border rounded-lg p-4 ${getStatusColor(feature.status)}`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-lg">{getStatusIcon(feature.status)}</span>
                                <h3 className="font-semibold">{feature.name}</h3>
                            </div>
                            {feature.details && (
                                <p className="text-sm mt-1 opacity-80">{feature.details}</p>
                            )}
                            {feature.error && (
                                <p className="text-sm mt-1 text-red-600">{feature.error}</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Notification Settings */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <h2 className="text-xl font-semibold">Notification Settings</h2>
                <p className="text-sm text-gray-600">Enable or disable notification services. Changes take effect immediately.</p>

                <div className="space-y-3">
                    {/* Email Notifications */}
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded p-4">
                        <div>
                            <p className="font-medium text-gray-900">Email Notifications</p>
                            <p className="text-sm text-gray-600">{getSetting(systemSettings, "email_notifications_enabled").description}</p>
                        </div>
                        <button
                            onClick={() => handleToggleSetting("email_notifications_enabled", getSetting(systemSettings, "email_notifications_enabled").value)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${getSetting(systemSettings, "email_notifications_enabled").value === "true" ? "bg-green-500" : "bg-gray-300"
                                }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${getSetting(systemSettings, "email_notifications_enabled").value === "true" ? "translate-x-6" : "translate-x-1"
                                    }`}
                            />
                        </button>
                    </div>

                </div>
            </div>

            {/* Service Testing */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <h2 className="text-xl font-semibold">Service Testing</h2>
                <p className="text-sm text-gray-600">Test individual services to verify configuration.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Test Email */}
                    <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-2">
                        <p className="font-medium text-gray-900">Test Email</p>
                        <input
                            type="email"
                            placeholder="recipient@tamu.edu"
                            value={testEmailAddress}
                            onChange={(e) => setTestEmailAddress(e.target.value)}
                            className="w-full px-3 py-2 border rounded text-sm"
                        />
                        <button
                            onClick={handleTestEmail}
                            disabled={testingService === "email"}
                            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm"
                        >
                            {testingService === "email" ? "Sending..." : "Send Test Email"}
                        </button>
                    </div>


                    {/* Test Inflow */}
                    <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-2">
                        <p className="font-medium text-gray-900">Test Inflow API</p>
                        <p className="text-xs text-gray-500">Tests connection to Inflow inventory system.</p>
                        <button
                            onClick={handleTestInflow}
                            disabled={testingService === "inflow"}
                            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm"
                        >
                            {testingService === "inflow" ? "Testing..." : "Test Connection"}
                        </button>
                    </div>

                    {/* Test SharePoint */}
                    <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-2">
                        <p className="font-medium text-gray-900">Test SharePoint</p>
                        <p className="text-xs text-gray-500">Tests connection to SharePoint document storage.</p>
                        <button
                            onClick={handleTestSharePoint}
                            disabled={testingService === "sharepoint"}
                            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm"
                        >
                            {testingService === "sharepoint" ? "Testing..." : "Test Connection"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Inflow Webhook Section */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <h2 className="text-xl font-semibold">Inflow Webhook</h2>

                {activeWebhook ? (
                    <div className="bg-green-50 border border-green-200 rounded p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-green-800">✓ Webhook Active</p>
                                <p className="text-sm text-green-600 mt-1">
                                    {activeWebhook.url}
                                </p>
                                <p className="text-sm text-green-600">
                                    Events: {activeWebhook.events.join(", ")}
                                </p>
                                {activeWebhook.last_received_at && (
                                    <p className="text-sm text-green-600">
                                        Last event: {new Date(activeWebhook.last_received_at).toLocaleString()}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => handleDeleteInflowWebhook(activeWebhook.webhook_id)}
                                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-yellow-800">No active webhook registered</p>
                            <button
                                onClick={handleAutoRegisterWebhook}
                                disabled={registeringWebhook}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                            >
                                {registeringWebhook ? "Registering..." : "Register Webhook"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Manual Actions */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <h2 className="text-xl font-semibold">Manual Actions</h2>
                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded p-4">
                    <div>
                        <p className="font-medium text-gray-900">Sync Orders</p>
                        <p className="text-sm text-gray-600">
                            Manually fetch recent "Started" orders from Inflow and update the database.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (confirm("This will fetch recent orders from Inflow. Continue?")) {
                                try {
                                    setMessage({ type: "success", text: "Syncing started..." });
                                    const res = await apiClient.post("/system/sync");
                                    setMessage({
                                        type: "success",
                                        text: res.data.message || "Sync completed successfully"
                                    });
                                } catch (error: any) {
                                    console.error("Sync failed:", error);
                                    setMessage({
                                        type: "error",
                                        text: error.response?.data?.message || "Sync failed"
                                    });
                                }
                            }
                        }}
                        className="px-4 py-2 bg-[#800000] text-white rounded hover:bg-[#660000]"
                    >
                        Sync Orders
                    </button>
                </div>
            </div>
        </div>
    );
}
