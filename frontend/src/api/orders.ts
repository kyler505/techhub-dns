import apiClient from "./client";
import { Order, OrderDetail, OrderStatus, OrderStatusUpdate, BulkStatusUpdate, AuditLog, ShippingWorkflowStatus } from "../types/order";

export const ordersApi = {
  getOrders: async (params?: { status?: OrderStatus; search?: string }): Promise<Order[]> => {
    const response = await apiClient.get<Order[]>("/orders", { params });
    return response.data;
  },

  getOrder: async (orderId: string): Promise<OrderDetail> => {
    const response = await apiClient.get<OrderDetail>(`/orders/${orderId}`);
    return response.data;
  },

  getTagRequestCandidates: async (params?: { limit?: number; search?: string }): Promise<Order[]> => {
    const response = await apiClient.get<Order[]>("/orders/tag-request/candidates", { params });
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

  tagOrder: async (orderId: string, payload: { tag_ids: string[]; technician?: string }) => {
    const response = await apiClient.post<Order>(`/orders/${orderId}/tag`, payload);
    return response.data;
  },

  startTagRequest: async (orderId: string) => {
    const response = await apiClient.post<Order>(`/orders/${orderId}/tag/request`);
    return response.data;
  },

  generatePicklist: async (orderId: string, payload?: { generated_by?: string }) => {
    const response = await apiClient.post<Order>(`/orders/${orderId}/picklist`, payload || {});
    return response.data;
  },

  submitQa: async (
    orderId: string,
    payload: { responses: Record<string, any>; technician?: string }
  ) => {
    const response = await apiClient.post<Order>(`/orders/${orderId}/qa`, payload);
    return response.data;
  },

  signOrder: async (orderId: string, signatureData?: {
    signature_image: string;
    placements?: Array<{ page_number: number; x: number; y: number; width: number; height: number }>;
    page_number?: number;
    position?: { x: number; y: number }
  }) => {
    const response = await apiClient.post<{ success: boolean; message: string; bundled_document_path?: string }>(`/orders/${orderId}/sign`, signatureData);
    return response.data;
  },

  updateShippingWorkflow: async (
    orderId: string,
    payload: {
      status: ShippingWorkflowStatus;
      carrier_name?: string;
      tracking_number?: string;
      updated_by?: string;
    }
  ): Promise<Order> => {
    const response = await apiClient.patch<Order>(`/orders/${orderId}/shipping-workflow`, payload);
    return response.data;
  },

  getShippingWorkflow: async (orderId: string) => {
    const response = await apiClient.get<{
      shipping_workflow_status?: string;
      shipping_workflow_status_updated_at?: string;
      shipping_workflow_status_updated_by?: string;
      shipped_to_carrier_at?: string;
      shipped_to_carrier_by?: string;
      carrier_name?: string;
      tracking_number?: string;
    }>(`/orders/${orderId}/shipping-workflow`);
    return response.data;
  },
};
