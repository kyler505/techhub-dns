from pydantic import BaseModel, Field, field_serializer, field_validator
from typing import List, Optional
from datetime import datetime
from uuid import UUID

from app.models.delivery_run import VehicleEnum, DeliveryRunStatus


class CreateDeliveryRunRequest(BaseModel):
    # Deprecated/ignored: identity is derived from the authenticated session.
    runner: Optional[str] = None
    order_ids: List[UUID]
    vehicle: str

    @field_validator('vehicle')
    @classmethod
    def validate_vehicle(cls, v):
        allowed_vehicles = ['van', 'golf_cart']
        if v not in allowed_vehicles:
            raise ValueError(f'Vehicle must be one of: {allowed_vehicles}')
        return v


class DeliveryRunResponse(BaseModel):
    id: UUID
    name: str
    runner: str
    vehicle: str
    status: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    order_ids: List[UUID] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class OrderSummary(BaseModel):
    id: UUID
    inflow_order_id: Optional[str] = None
    recipient_name: Optional[str] = None
    delivery_location: Optional[str] = None
    status: str

    model_config = {"from_attributes": True}


class DeliveryRunDetailResponse(BaseModel):
    id: UUID
    name: str
    runner: str
    vehicle: str
    status: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    orders: List[OrderSummary] = Field(default_factory=list)

    model_config = {"from_attributes": True}
