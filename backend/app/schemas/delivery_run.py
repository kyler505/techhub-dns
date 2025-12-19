from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from uuid import UUID

from app.models.delivery_run import VehicleEnum, DeliveryRunStatus


class CreateDeliveryRunRequest(BaseModel):
    runner: str
    order_ids: List[UUID]
    vehicle: VehicleEnum


class DeliveryRunResponse(BaseModel):
    id: UUID
    runner: str
    vehicle: VehicleEnum
    status: DeliveryRunStatus
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    order_ids: List[UUID] = Field(default_factory=list)

    model_config = {"from_attributes": True}
