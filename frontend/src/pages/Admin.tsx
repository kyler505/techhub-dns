import { useState, useEffect } from "react";
import { inflowApi, WebhookResponse } from "../api/inflow";
import { apiClient } from "../api/client";
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

export default function Admin() {
    const { user } = useAuth();
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Inflow webhook state
    const [inflowWebhooks, setInflowWebhooks] = useState<WebhookResponse[]>([]);
    const [registeringWebhook, setRegisteringWebhook] = useState(false);

    useEffect(() => {
        loadSystemStatus();
        loadInflowWebhooks();
    }, []);

    const loadSystemStatus = async () => {
        setLoading(true);
        try {
            // Get backend feature status
            const response = await apiClient.get("/system/status");
            setSystemStatus(response.data);
        } catch (error) {
            console.error("Failed to load system status:", error);
            // Fallback to basic status based on what we know
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

    const loadInflowWebhooks = async () => {
        try {
            const response = await inflowApi.listWebhooks();
            setInflowWebhooks(response.webhooks);
        } catch (error) {
            console.error("Failed to load Inflow webhooks:", error);
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
        <div className="p-4 w-full max-w-4xl mx-auto space-y-6 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">System Status</h1>
                {user && (
                    <span className="text-sm text-gray-500">Logged in as {user.email}</span>
                )}
            </div>

            {/* Feature Status Grid */}
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

            {/* Message Display */}
            {message && (
                <div
                    className={`p-3 rounded ${message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                >
                    {message.text}
                </div>
            )}
        </div>
    );
}
