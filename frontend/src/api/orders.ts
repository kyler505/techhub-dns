import apiClient from "./client";
import { Order, OrderDetail, OrderStatus, OrderStatusUpdate, BulkStatusUpdate, AuditLog } from "../types/order";

export const ordersApi = {
  getOrders: async (params?: { status?: OrderStatus; search?: string }): Promise<Order[]> => {
    const response = await apiClient.get<Order[]>("/orders", { params });
    return response.data;
  },

  getOrder: async (orderId: string): Promise<OrderDetail> => {
    const response = await apiClient.get<OrderDetail>(`/orders/${orderId}`);
    return response.data;
  },

  updateOrderStatus: async (orderId: string, update: OrderStatusUpdate, changedBy?: string): Promise<Order> => {
    const response = await apiClient.patch<Order>(
      `/orders/${orderId}/status`,
      update,
      {
        params: changedBy ? { changed_by: changedBy } : undefined,
      }
    );
    return response.data;
  },

  bulkUpdateStatus: async (payload: BulkStatusUpdate): Promise<Order[]> => {
    const response = await apiClient.post<Order[]>("/orders/bulk-transition", payload);
    return response.data;
  },

  getOrderAudit: async (orderId: string): Promise<AuditLog[]> => {
    const response = await apiClient.get<AuditLog[]>(`/orders/${orderId}/audit`);
    return response.data;
  },

  retryNotification: async (orderId: string) => {
    const response = await apiClient.post(`/orders/${orderId}/retry-notification`);
    return response.data;
  },
};
