from pydantic import BaseModel, Field, field_serializer
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID
from app.models.order import OrderStatus, ShippingWorkflowStatus
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


class SignatureData(BaseModel):
    signature_image: str  # Base64 encoded PNG
    page_number: int = 1
    position: Dict[str, float] = Field(default_factory=dict)  # x, y coordinates for placement


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
    qa_method: Optional[str] = None
    signature_captured_at: Optional[datetime] = None
    signed_picklist_path: Optional[str] = None
    shipping_workflow_status: Optional[ShippingWorkflowStatus] = None
    shipping_workflow_status_updated_at: Optional[datetime] = None
    shipping_workflow_status_updated_by: Optional[str] = None
    shipped_to_carrier_at: Optional[datetime] = None
    shipped_to_carrier_by: Optional[str] = None
    carrier_name: Optional[str] = None
    tracking_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer('status')
    def serialize_status(self, value):
        return value

    @field_serializer('shipping_workflow_status')
    def serialize_shipping_workflow_status(self, value):
        return value


class OrderDetailResponse(OrderResponse):
    inflow_data: Optional[Dict[str, Any]] = None
    teams_notifications: Optional[List[TeamsNotificationResponse]] = None


class BulkStatusUpdate(BaseModel):
    order_ids: List[UUID]
    status: OrderStatus
    reason: Optional[str] = None


class ShippingWorkflowUpdateRequest(BaseModel):
    status: ShippingWorkflowStatus
    carrier_name: Optional[str] = None
    tracking_number: Optional[str] = None
    updated_by: Optional[str] = None


class ShippingWorkflowResponse(BaseModel):
    shipping_workflow_status: Optional[str] = None
    shipping_workflow_status_updated_at: Optional[datetime] = None
    shipping_workflow_status_updated_by: Optional[str] = None
    shipped_to_carrier_at: Optional[datetime] = None
    shipped_to_carrier_by: Optional[str] = None
    carrier_name: Optional[str] = None
    tracking_number: Optional[str] = None
