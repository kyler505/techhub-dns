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

export const observabilityApi = {
    getSystemAudit: async (params?: GetSystemAuditParams): Promise<SystemAuditResponse> => {
        const response = await apiClient.get<SystemAuditResponse>("/observability/system-audit", { params });
        return response.data;
    },
};

export default observabilityApi;
