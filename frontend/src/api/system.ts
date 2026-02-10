import { apiClient } from "./client";

export type SyncHealthResponse = {
  server_time: string;
  inflow: {
    webhook_enabled: boolean;
    webhook_failed: boolean;
    last_webhook_received_at: string | null;
  };
};

export const systemApi = {
  async getSyncHealth(): Promise<SyncHealthResponse> {
    const response = await apiClient.get("/system/sync-health");
    return response.data;
  },
};
