export enum OrderStatus {
  PICKED = "Picked",
  PRE_DELIVERY = "PreDelivery",
  IN_DELIVERY = "InDelivery",
  SHIPPING = "Shipping",
  DELIVERED = "Delivered",
  ISSUE = "Issue",
}

export interface Order {
  id: string;
  inflow_order_id: string;
  inflow_sales_order_id?: string;
  recipient_name?: string;
  recipient_contact?: string;
  delivery_location?: string;
  po_number?: string;
  status: OrderStatus;
  assigned_deliverer?: string;
  delivery_run_id?: string;
  issue_reason?: string;
  tagged_at?: string;
  tagged_by?: string;
  tag_data?: Record<string, any>;
  picklist_generated_at?: string;
  picklist_generated_by?: string;
  picklist_path?: string;
  qa_completed_at?: string;
  qa_completed_by?: string;
  qa_data?: Record<string, any>;
  qa_path?: string;
  qa_method?: string;
  signature_captured_at?: string;
  signed_picklist_path?: string;
  inflow_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OrderDetail extends Order {
  inflow_data?: Record<string, any>;
}

export interface OrderStatusUpdate {
  status: OrderStatus;
  reason?: string;
}

export interface BulkStatusUpdate {
  order_ids: string[];
  status: OrderStatus;
  reason?: string;
}

export interface AuditLog {
  id: string;
  order_id: string;
  changed_by?: string;
  from_status?: string;
  to_status: string;
  reason?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TeamsNotification {
  id: string;
  order_id: string;
  teams_message_id?: string;
  sent_at?: string;
  status: "pending" | "sent" | "failed";
  notification_type?: string;
  error_message?: string;
  retry_count: number;
  created_at: string;
}

export interface TeamsConfig {
  webhook_url?: string;
  updated_at: string;
  updated_by?: string;
}

export interface InflowSyncResponse {
  success: boolean;
  orders_synced: number;
  orders_created: number;
  orders_updated: number;
  message: string;
}
