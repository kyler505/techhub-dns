import { useState, useEffect } from "react";
import { teamsApi } from "../api/teams";
import { inflowApi, WebhookResponse } from "../api/inflow";
import { sharepointApi, SharePointStatus } from "../api/sharepoint";

export default function Admin() {
    const [webhookUrl, setWebhookUrl] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
        null
    );

    // Inflow webhook state
    const [inflowWebhooks, setInflowWebhooks] = useState<WebhookResponse[]>([]);
    const [inflowWebhookUrl, setInflowWebhookUrl] = useState("");
    const [inflowWebhookEvents, setInflowWebhookEvents] = useState<string[]>([]);
    const [registeringWebhook, setRegisteringWebhook] = useState(false);

    // SharePoint state
    const [sharepointStatus, setSharepointStatus] = useState<SharePointStatus | null>(null);
    const [authenticatingSharepoint, setAuthenticatingSharepoint] = useState(false);
    const [testingSharepoint, setTestingSharepoint] = useState(false);

    useEffect(() => {
        loadConfig();
        loadInflowWebhooks();
        loadInflowDefaults();
        loadSharepointStatus();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const config = await teamsApi.getConfig();
            setWebhookUrl(config.webhook_url || "");
        } catch (error) {
            console.error("Failed to load config:", error);
            setMessage({ type: "error", text: "Failed to load configuration" });
        } finally {
            setLoading(false);
        }
    };

    const loadInflowWebhooks = async () => {
        try {
            const response = await inflowApi.listWebhooks();
            setInflowWebhooks(response.webhooks);
            const active = response.webhooks.find((webhook) => webhook.status === "active");
            if (active) {
                setInflowWebhookUrl(active.url);
                setInflowWebhookEvents(active.events);
            }
        } catch (error) {
            console.error("Failed to load Inflow webhooks:", error);
        }
    };

    const loadInflowDefaults = async () => {
        try {
            const defaults = await inflowApi.getWebhookDefaults();
            if (!inflowWebhookUrl && defaults.url) {
                setInflowWebhookUrl(defaults.url);
            }
            if (inflowWebhookEvents.length === 0 && defaults.events?.length) {
                setInflowWebhookEvents(defaults.events);
            }
        } catch (error) {
            console.error("Failed to load Inflow webhook defaults:", error);
        }
    };

    const loadSharepointStatus = async () => {
        try {
            const status = await sharepointApi.getStatus();
            setSharepointStatus(status);
        } catch (error) {
            console.error("Failed to load SharePoint status:", error);
        }
    };

    const handleSharepointAuth = async () => {
        setAuthenticatingSharepoint(true);
        setMessage(null);
        try {
            const result = await sharepointApi.authenticate();
            if (result.success) {
                setMessage({ type: "success", text: result.message || "SharePoint authenticated successfully" });
                await loadSharepointStatus();
            } else {
                setMessage({ type: "error", text: result.error || "Authentication failed" });
            }
        } catch (error: any) {
            console.error("Failed to authenticate SharePoint:", error);
            setMessage({ type: "error", text: error.response?.data?.error || "Authentication failed" });
        } finally {
            setAuthenticatingSharepoint(false);
        }
    };

    const handleSharepointTest = async () => {
        setTestingSharepoint(true);
        setMessage(null);
        try {
            const result = await sharepointApi.testUpload();
            if (result.success) {
                setMessage({ type: "success", text: `Test file uploaded: ${result.filename}` });
            } else {
                setMessage({ type: "error", text: result.error || "Test upload failed" });
            }
        } catch (error: any) {
            console.error("Failed to test SharePoint:", error);
            setMessage({ type: "error", text: error.response?.data?.error || "Test upload failed" });
        } finally {
            setTestingSharepoint(false);
        }
    };

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSaving(true);
        setMessage(null);
        try {
            await teamsApi.updateConfig(webhookUrl, "admin");
            setMessage({ type: "success", text: "Configuration saved successfully" });
        } catch (error) {
            console.error("Failed to save config:", error);
            setMessage({ type: "error", text: "Failed to save configuration" });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        try {
            await teamsApi.testWebhook();
            setMessage({ type: "success", text: "Test notification sent successfully" });
        } catch (error) {
            console.error("Failed to test webhook:", error);
            setMessage({ type: "error", text: "Failed to send test notification" });
        }
    };

    const handleRegisterInflowWebhook = async () => {
        if (!inflowWebhookUrl) {
            setMessage({ type: "error", text: "Webhook URL is required" });
            return;
        }

        setRegisteringWebhook(true);
        setMessage(null);
        try {
            await inflowApi.registerWebhook({
                url: inflowWebhookUrl,
                events: inflowWebhookEvents,
            });
            setMessage({ type: "success", text: "Inflow webhook registered successfully" });
            setInflowWebhookUrl("");
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

    const handleTestInflowWebhook = async () => {
        try {
            await inflowApi.testWebhook();
            setMessage({ type: "success", text: "Webhook endpoint is configured and reachable" });
        } catch (error: any) {
            console.error("Failed to test webhook:", error);
            setMessage({
                type: "error",
                text: error.response?.data?.detail || "Failed to test webhook",
            });
        }
    };

    if (loading) {
        return <div className="p-4">Loading...</div>;
    }

    const activeWebhook = inflowWebhooks.find((w) => w.status === "active");

    return (
        <div className="p-4 max-w-4xl space-y-6">
            <h1 className="text-2xl font-bold mb-4">Admin</h1>

            {/* SharePoint Configuration */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <h2 className="text-xl font-semibold mb-4">SharePoint Storage</h2>

                {sharepointStatus && (
                    <div className={`border rounded p-4 ${sharepointStatus.enabled
                            ? sharepointStatus.authenticated
                                ? "bg-green-50 border-green-200"
                                : "bg-yellow-50 border-yellow-200"
                            : "bg-gray-50 border-gray-200"
                        }`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`font-medium ${sharepointStatus.enabled
                                        ? sharepointStatus.authenticated
                                            ? "text-green-800"
                                            : "text-yellow-800"
                                        : "text-gray-800"
                                    }`}>
                                    {sharepointStatus.enabled
                                        ? sharepointStatus.authenticated
                                            ? "✓ Connected"
                                            : "⚠ Not Authenticated"
                                        : "Disabled"}
                                </p>
                                {sharepointStatus.site_url && (
                                    <p className="text-sm text-gray-600 mt-1">
                                        Site: {sharepointStatus.site_url}
                                    </p>
                                )}
                                {sharepointStatus.folder_path && (
                                    <p className="text-sm text-gray-600">
                                        Folder: Documents/{sharepointStatus.folder_path}
                                    </p>
                                )}
                                {sharepointStatus.error && (
                                    <p className="text-sm text-red-600 mt-1">
                                        Error: {sharepointStatus.error}
                                    </p>
                                )}
                            </div>
                            {sharepointStatus.enabled && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSharepointAuth}
                                        disabled={authenticatingSharepoint}
                                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm"
                                    >
                                        {authenticatingSharepoint ? "Authenticating..." : "Authenticate"}
                                    </button>
                                    {sharepointStatus.authenticated && (
                                        <button
                                            onClick={handleSharepointTest}
                                            disabled={testingSharepoint}
                                            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 text-sm"
                                        >
                                            {testingSharepoint ? "Testing..." : "Test Upload"}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!sharepointStatus?.enabled && (
                    <p className="text-sm text-gray-500">
                        Set SHAREPOINT_ENABLED=true in .env to enable SharePoint storage.
                    </p>
                )}
            </div>

            {/* Teams Configuration */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <h2 className="text-xl font-semibold mb-4">Teams Configuration</h2>
                <div>
                    <label className="block text-sm font-medium mb-2">Teams Webhook URL</label>
                    <input
                        type="text"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://outlook.office.com/webhook/..."
                        className="w-full px-4 py-2 border rounded"
                    />

                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                    >
                        {saving ? "Saving..." : "Save Configuration"}
                    </button>
                    <button
                        onClick={handleTest}
                        disabled={!webhookUrl}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
                    >
                        Test Webhook
                    </button>
                </div>
            </div>

            {/* Inflow Webhook Configuration */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <h2 className="text-xl font-semibold mb-4">Inflow Webhook Configuration</h2>

                {/* Webhook Status */}
                {activeWebhook && (
                    <div className="bg-green-50 border border-green-200 rounded p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-green-800">Webhook Active</p>
                                <p className="text-sm text-green-600">
                                    URL: {activeWebhook.url}
                                </p>
                                <p className="text-sm text-green-600">
                                    Events: {activeWebhook.events.join(", ")}
                                </p>
                                {activeWebhook.last_received_at && (
                                    <p className="text-sm text-green-600">
                                        Last received: {new Date(activeWebhook.last_received_at).toLocaleString()}
                                    </p>
                                )}
                                {activeWebhook.failure_count > 0 && (
                                    <p className="text-sm text-yellow-600">
                                        Failures: {activeWebhook.failure_count}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleTestInflowWebhook}
                                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                                >
                                    Test
                                </button>
                                <button
                                    onClick={() => handleDeleteInflowWebhook(activeWebhook.webhook_id)}
                                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!activeWebhook && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                        <p className="text-yellow-800">No active webhook registered</p>
                    </div>
                )}

                {/* Register New Webhook */}
                <div className="border-t pt-4">
                    <h3 className="font-medium mb-3">Register New Webhook</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium mb-2">Webhook URL</label>
                            <input
                                type="text"
                                value={inflowWebhookUrl}
                                onChange={(e) => setInflowWebhookUrl(e.target.value)}
                                placeholder="https://your-app.com/api/inflow/webhook"
                                className="w-full px-4 py-2 border rounded"
                            />

                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Events</label>
                            <div className="space-y-2">
                                {["orderCreated", "orderUpdated"].map((event) => (
                                    <label key={event} className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={inflowWebhookEvents.includes(event)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setInflowWebhookEvents([...inflowWebhookEvents, event]);
                                                } else {
                                                    setInflowWebhookEvents(
                                                        inflowWebhookEvents.filter((e) => e !== event)
                                                    );
                                                }
                                            }}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">{event}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={handleRegisterInflowWebhook}
                            disabled={registeringWebhook || !inflowWebhookUrl}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                        >
                            {registeringWebhook ? "Registering..." : "Register Webhook"}
                        </button>
                    </div>
                </div>
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
