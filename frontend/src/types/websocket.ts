export type DeliveryRun = {
  id: string;
  name: string;
  runner: string;
  vehicle: string;
  status: string;
  start_time: string | null;
  order_ids: string[];
};

export type OrderSummary = {
  id: string;
  inflow_order_id: string;
  recipient_name?: string;
  status: string;
  updated_at: string | null;
  delivery_location?: string;
  assigned_deliverer?: string;
};

export type WebSocketMessage =
  | { type: "active_runs"; data: DeliveryRun[] }
  | { type: "orders_update"; data: OrderSummary[] };
