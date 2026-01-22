/**
 * System Settings API client.
 */

import { apiClient } from "./client";

export interface SystemSettingValue {
    value: string;
    description: string;
    updated_at: string | null;
    updated_by: string | null;
}

export interface SystemSettings {
    // Toggles
    email_notifications_enabled: SystemSettingValue;
    teams_recipient_notifications_enabled: SystemSettingValue;
    sharepoint_enabled: SystemSettingValue;

    // Azure
    azure_tenant_id: SystemSettingValue;
    azure_client_id: SystemSettingValue;
    azure_client_secret: SystemSettingValue;

    // Email
    email_from_address: SystemSettingValue;
    email_from_name: SystemSettingValue;

    // SharePoint
    sharepoint_site_url: SystemSettingValue;
    sharepoint_folder_path: SystemSettingValue;
    teams_notification_queue_folder: SystemSettingValue;

    // Inflow
    inflow_api_url: SystemSettingValue;
    inflow_company_id: SystemSettingValue;
    inflow_api_key: SystemSettingValue;
    inflow_webhook_secret: SystemSettingValue;
}


export interface TestResult {
    success: boolean;
    message?: string;
    error?: string;
}

export const settingsApi = {
    /**
     * Get all system settings.
     */
    async getSettings(): Promise<SystemSettings> {
        const response = await apiClient.get("/system/settings");
        return response.data;
    },

    /**
     * Update a single setting.
     */
    async updateSetting(key: string, value: string, updatedBy?: string): Promise<{ key: string; value: string }> {
        const response = await apiClient.put(`/system/settings/${key}`, {
            value,
            updated_by: updatedBy,
        });
        return response.data;
    },

    // ========== Testing Endpoints ==========

    /**
     * Send a test email.
     */
    async testEmail(toAddress: string): Promise<TestResult> {
        const response = await apiClient.post("/system/test/email", { to_address: toAddress });
        return response.data;
    },

    /**
     * Send a test Teams message to recipient.
     */
    async testTeamsRecipient(recipientEmail: string): Promise<TestResult> {
        const response = await apiClient.post("/system/test/teams-recipient", { recipient_email: recipientEmail });
        return response.data;
    },


    /**
     * Test Inflow API connection.
     */
    async testInflow(): Promise<TestResult> {
        const response = await apiClient.post("/system/test/inflow");
        return response.data;
    },

    /**
     * Test SharePoint connection.
     */
    async testSharePoint(): Promise<TestResult> {
        const response = await apiClient.post("/system/test/sharepoint");
        return response.data;
    },
};
