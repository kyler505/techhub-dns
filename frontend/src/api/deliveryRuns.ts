import apiClient from "./client";

export interface CreateDeliveryRunRequest {
  runner: string;
  order_ids: string[];
  vehicle: "Truck" | "Golf Cart" | "On Foot";
}

export interface DeliveryRunResponse {
  id: string;
  runner: string;
  vehicle: string;
  status: string;
  start_time: string | null;
}

export const deliveryRunsApi = {
  createRun: async (request: CreateDeliveryRunRequest): Promise<DeliveryRunResponse> => {
    const response = await apiClient.post<DeliveryRunResponse>("/delivery-runs", request);
    return response.data;
  },
};
