import apiClient from "./client";

export interface TableStat {
    table: string;
    row_count: number;
    last_updated?: string | null;
}

export interface TableStatsResponse {
    generated_at: string;
    tables: TableStat[];
}

export interface SchemaColumn {
    name: string;
    type: string;
    is_pk: boolean;
    is_fk: boolean;
    nullable?: boolean;
}

export interface SchemaTable {
    name: string;
    columns: SchemaColumn[];
}

export interface SchemaRelationship {
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
}

export interface SchemaSummaryResponse {
    tables: SchemaTable[];
    relationships: SchemaRelationship[];
}

export interface SystemAuditItem {
    id: string;
    timestamp: string;
    entity_type: string;
    entity_id: string;
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
    getSchemaSummary: async (): Promise<SchemaSummaryResponse> => {
        const response = await apiClient.get<SchemaSummaryResponse>("/observability/schema-summary");
        return response.data;
    },

    getTableStats: async (): Promise<TableStatsResponse> => {
        const response = await apiClient.get<TableStatsResponse>("/observability/table-stats");
        return response.data;
    },

    getSystemAudit: async (params?: GetSystemAuditParams): Promise<SystemAuditResponse> => {
        const response = await apiClient.get<SystemAuditResponse>("/observability/system-audit", { params });
        return response.data;
    },
};

export default observabilityApi;
