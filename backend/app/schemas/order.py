from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID
from app.models.order import OrderStatus
from app.schemas.teams import TeamsNotificationResponse


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


class AssetTagUpdate(BaseModel):
    tag_ids: List[str] = Field(default_factory=list)
    technician: Optional[str] = None


class PicklistGenerationRequest(BaseModel):
    generated_by: Optional[str] = None


class QASubmission(BaseModel):
    responses: Dict[str, Any] = Field(default_factory=dict)
    technician: Optional[str] = None


class OrderResponse(OrderBase):
    id: UUID
    inflow_sales_order_id: Optional[str] = None
    status: OrderStatus
    issue_reason: Optional[str] = None
    tagged_at: Optional[datetime] = None
    tagged_by: Optional[str] = None
    tag_data: Optional[Dict[str, Any]] = None
    picklist_generated_at: Optional[datetime] = None
    picklist_generated_by: Optional[str] = None
    picklist_path: Optional[str] = None
    qa_completed_at: Optional[datetime] = None
    qa_completed_by: Optional[str] = None
    qa_data: Optional[Dict[str, Any]] = None
    qa_path: Optional[str] = None
    signature_captured_at: Optional[datetime] = None
    signed_picklist_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrderDetailResponse(OrderResponse):
    inflow_data: Optional[Dict[str, Any]] = None
    teams_notifications: Optional[List[TeamsNotificationResponse]] = None


class BulkStatusUpdate(BaseModel):
    order_ids: List[UUID]
    status: OrderStatus
    reason: Optional[str] = None
