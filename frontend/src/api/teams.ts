import apiClient from "./client";
import { TeamsConfig } from "../types/order";

export const teamsApi = {
  getConfig: async () => {
    const response = await apiClient.get<TeamsConfig>("/teams/config");
    return response.data;
  },

  updateConfig: async (webhookUrl: string, updatedBy?: string) => {
    const response = await apiClient.put<TeamsConfig>(
      "/teams/config",
      { webhook_url: webhookUrl },
      { params: { updated_by: updatedBy } }
    );
    return response.data;
  },

  testWebhook: async () => {
    const response = await apiClient.post("/teams/test");
    return response.data;
  },
};
