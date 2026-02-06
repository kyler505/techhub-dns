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
    email_notifications_enabled: SystemSettingValue;
    teams_recipient_notifications_enabled: SystemSettingValue;
}


export interface TestResult {
    success: boolean;
    message?: string;
    error?: string;
}

export interface CanopyOrdersUploadResult {
    success: boolean;
    filename?: string | null;
    uploaded_url?: string | null;
    count?: number;
    teams_notified?: boolean;
    updated_orders?: number;
    eligible_orders?: string[];
    ineligible_orders?: Array<{ order: string; reason: string }>;
    missing_orders?: string[];
    error?: string;
    error_type?: string;
    status_code?: number;
}

export interface CanopyOrdersBypassUploadResult {
    success: boolean;
    filename?: string | null;
    uploaded_url?: string | null;
    count?: number;
    teams_notified?: boolean;
    updated_orders?: number;
    missing_orders?: string[];
    error?: string;
    error_type?: string;
    status_code?: number;
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

    /**
     * Upload Canopy orders (legacy uploader).
     */
    async uploadCanopyOrders(orders: string[]): Promise<CanopyOrdersUploadResult> {
        const response = await apiClient.post("/system/canopyorders/upload", { orders });
        return response.data;
    },

    /**
     * Upload Canopy orders (bypass eligibility checks).
     */
    async uploadCanopyOrdersBypass(orders: string[]): Promise<CanopyOrdersBypassUploadResult> {
        const response = await apiClient.post("/system/canopyorders/upload-bypass", { orders });
        return response.data;
    },
};
