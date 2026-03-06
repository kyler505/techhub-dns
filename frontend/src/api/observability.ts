import apiClient from "./client";

export interface SystemAuditItem {
    id: string;
    timestamp: string;
    entity_type: string;
    entity_id: string;
    order_number?: string | null;
    action: string;
    description?: string | null;
    user_id?: string | null;
    user_role?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    old_values?: unknown;
    new_values?: unknown;
}

export interface SystemAuditResponse {
    items: SystemAuditItem[];
    next_cursor?: string | null;
}

export interface GetSystemAuditParams {
    limit?: number;
    entity_type?: string;
    entity_id?: string;
    action?: string;
    since?: string | number;
    cursor?: string;
    include_values?: boolean;
}

export interface RuntimeSummaryResponse {
    generated_at: string;
    app: {
        scheduler_enabled: boolean;
        inflow_polling_sync_enabled: boolean;
        inflow_webhook_enabled: boolean;
        cors_allowed_origins: string[];
    };
    database: {
        database_backend: string;
        pool_size: number | null;
        max_overflow: number | null;
        pool_timeout: number | null;
        pool_recycle: number | null;
    };
    rate_limits: {
        window_seconds: number;
        rules: Record<string, number>;
        active_events: Record<string, number>;
        active_scopes: Record<string, number>;
    };
    workload: {
        active_sessions: number;
        active_delivery_runs: number;
        open_orders: number;
    };
    inflow: {
        active_webhook: boolean;
        webhook_id: string | null;
        last_webhook_received_at: string | null;
        effective_poll_interval_minutes: number | null;
    };
}

export const observabilityApi = {
    getSystemAudit: async (params?: GetSystemAuditParams): Promise<SystemAuditResponse> => {
        const response = await apiClient.get<SystemAuditResponse>("/observability/system-audit", { params });
        return response.data;
    },
    getRuntimeSummary: async (): Promise<RuntimeSummaryResponse> => {
        const response = await apiClient.get<RuntimeSummaryResponse>("/observability/runtime-summary");
        return response.data;
    },
};

export default observabilityApi;
