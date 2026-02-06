import apiClient from "./client";

// TypeScript interfaces matching backend Pydantic schemas
export interface StatusCountsResponse {
  [key: string]: number;
}

export interface DeliveryPerformanceResponse {
  active_runs: number;
  completed_today: number;
  ready_for_delivery: number;
}

export interface ActivityItem {
  type: string;
  order_id: string;
  timestamp: string;
  description: string;
  changed_by?: string;
}

export interface RecentActivityResponse {
  items: ActivityItem[];
}

export interface TimeTrendDataPoint {
  date: string;
  count: number;
  status_breakdown?: { [key: string]: number };
}

export interface TimeTrendsResponse {
  period: string;
  data: TimeTrendDataPoint[];
}

// API client functions
export const analyticsApi = {
  getOrderStatusCounts: async (): Promise<StatusCountsResponse> => {
    const response = await apiClient.get<StatusCountsResponse>("/analytics/order-status-counts");
    return response.data;
  },

  getDeliveryPerformance: async (): Promise<DeliveryPerformanceResponse> => {
    const response = await apiClient.get<DeliveryPerformanceResponse>("/analytics/delivery-performance");
    return response.data;
  },

  getRecentActivity: async (params?: { limit?: number }): Promise<RecentActivityResponse> => {
    const response = await apiClient.get<RecentActivityResponse>("/analytics/recent-activity", { params });
    return response.data;
  },

  getTimeTrends: async (period: "day" | "week", days: number): Promise<TimeTrendsResponse> => {
    const response = await apiClient.get<TimeTrendsResponse>("/analytics/time-trends", {
      params: { period, days },
    });
    return response.data;
  },
};

export default analyticsApi;
