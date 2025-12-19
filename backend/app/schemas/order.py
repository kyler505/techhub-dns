from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID
from app.models.order import OrderStatus


class OrderBase(BaseModel):
    inflow_order_id: str
    recipient_name: Optional[str] = None
    recipient_contact: Optional[str] = None
    delivery_location: Optional[str] = None
    po_number: Optional[str] = None
    assigned_deliverer: Optional[str] = None


class OrderCreate(OrderBase):
    inflow_sales_order_id: Optional[str] = None
    inflow_data: Optional[Dict[str, Any]] = None


class OrderUpdate(BaseModel):
    recipient_name: Optional[str] = None
    recipient_contact: Optional[str] = None
    delivery_location: Optional[str] = None
    assigned_deliverer: Optional[str] = None
    issue_reason: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    reason: Optional[str] = None


class OrderResponse(OrderBase):
    id: UUID
    inflow_sales_order_id: Optional[str] = None
    status: OrderStatus
    issue_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrderDetailResponse(OrderResponse):
    inflow_data: Optional[Dict[str, Any]] = None
    teams_notifications: Optional[List[Dict[str, Any]]] = None


class BulkStatusUpdate(BaseModel):
    order_ids: List[UUID]
    status: OrderStatus
    reason: Optional[str] = None
