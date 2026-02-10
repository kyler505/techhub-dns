import apiClient from "./client";

export type Vehicle = "van" | "golf_cart";

export interface VehicleCheckoutResponse {
  id: string;
  vehicle: Vehicle;
  checked_out_by: string;
  checked_out_by_email?: string | null;
  purpose?: string | null;
  checked_out_at: string;
  checked_in_at?: string | null;
}

export interface CheckoutRequest {
  vehicle: Vehicle;
  purpose?: string;
  notes?: string;
}

export interface CheckinRequest {
  vehicle: Vehicle;
  notes?: string;
}

export interface VehicleStatusItem {
  vehicle: Vehicle;
  checked_out: boolean;
  checked_out_by?: string | null;
  delivery_run_active: boolean;
}

export interface VehicleStatusResponse {
  vehicles: VehicleStatusItem[];
}

export const vehicleCheckoutsApi = {
  checkout: async (request: CheckoutRequest): Promise<VehicleCheckoutResponse> => {
    const response = await apiClient.post<VehicleCheckoutResponse>(
      "/vehicle-checkouts/checkout",
      request
    );
    return response.data;
  },

  checkin: async (request: CheckinRequest): Promise<VehicleCheckoutResponse> => {
    const response = await apiClient.post<VehicleCheckoutResponse>(
      "/vehicle-checkouts/checkin",
      request
    );
    return response.data;
  },

  getActive: async (): Promise<VehicleCheckoutResponse[]> => {
    const response = await apiClient.get<VehicleCheckoutResponse[]>(
      "/vehicle-checkouts/active"
    );
    return response.data;
  },

  getStatuses: async (): Promise<VehicleStatusResponse> => {
    const response = await apiClient.get<VehicleStatusResponse>(
      "/vehicles/status"
    );
    return response.data;
  },
};
