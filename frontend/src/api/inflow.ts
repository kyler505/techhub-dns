import apiClient from "./client";
import { InflowSyncResponse } from "../types/order";

export interface WebhookResponse {
  id: string;
  webhook_id: string;
  url: string;
  events: string[];
  status: string;
  last_received_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookListResponse {
  webhooks: WebhookResponse[];
}

export interface WebhookRegisterRequest {
  url: string;
  events: string[];
}

export interface WebhookDefaultsResponse {
  url: string | null;
  events: string[];
}

export const inflowApi = {
  sync: async () => {
    const response = await apiClient.post<InflowSyncResponse>("/inflow/sync");
    return response.data;
  },

  getSyncStatus: async () => {
    const response = await apiClient.get("/inflow/sync-status");
    return response.data;
  },

  registerWebhook: async (request: WebhookRegisterRequest) => {
    const response = await apiClient.post<WebhookResponse>("/inflow/webhooks/register", request);
    return response.data;
  },

  listWebhooks: async () => {
    const response = await apiClient.get<WebhookListResponse>("/inflow/webhooks");
    return response.data;
  },

  getWebhookDefaults: async () => {
    const response = await apiClient.get<WebhookDefaultsResponse>("/inflow/webhooks/defaults");
    return response.data;
  },

  deleteWebhook: async (webhookId: string) => {
    const response = await apiClient.delete(`/inflow/webhooks/${webhookId}`);
    return response.data;
  },

  testWebhook: async () => {
    const response = await apiClient.post("/inflow/webhooks/test");
    return response.data;
  },
};
