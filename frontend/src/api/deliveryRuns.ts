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
  order_ids: string[];
}

export interface OrderSummary {
  id: string;
  inflow_order_id: string | null;
  recipient_name: string | null;
  status: string;
}

export interface DeliveryRunDetailResponse {
  id: string;
  name: string;
  runner: string;
  vehicle: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
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
};
