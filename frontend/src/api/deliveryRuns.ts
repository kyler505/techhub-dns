import apiClient from "./client";

export interface CreateDeliveryRunRequest {
  runner: string;
  order_ids: string[];
  vehicle: "van" | "golf_cart";
}

export interface DeliveryRunResponse {
  id: string;
  name: string;
  runner: string;
  vehicle: string;
  status: string;
  start_time: string | null;
  end_time?: string | null;
}

export interface OrderSummary {
  id: string;
  inflow_order_id: string | null;
  recipient_name: string | null;
  delivery_location: string | null;
  status: string;
}

export interface DeliveryRunDetailResponse extends DeliveryRunResponse {
  orders: OrderSummary[];
}

export const deliveryRunsApi = {
  createRun: async (request: CreateDeliveryRunRequest): Promise<DeliveryRunResponse> => {
    const response = await apiClient.post<DeliveryRunResponse>("/delivery-runs", request);
    return response.data;
  },

  getRun: async (runId: string): Promise<DeliveryRunDetailResponse> => {
    const response = await apiClient.get<DeliveryRunDetailResponse>(`/delivery-runs/${runId}`);
    return response.data;
  },

  finishRun: async (runId: string): Promise<DeliveryRunResponse> => {
    const response = await apiClient.put<DeliveryRunResponse>(`/delivery-runs/${runId}/finish`);
    return response.data;
  },

  getRuns: async (status?: string[]): Promise<DeliveryRunResponse[]> => {
    const params = new URLSearchParams();
    if (status) {
      status.forEach(s => params.append('status', s));
    }
    const response = await apiClient.get<DeliveryRunResponse[]>("/delivery-runs", { params });
    return response.data;
  },
};
