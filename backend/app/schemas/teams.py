from pydantic import BaseModel, HttpUrl
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.teams_notification import NotificationStatus


class TeamsConfigResponse(BaseModel):
    webhook_url: Optional[str] = None
    updated_at: datetime
    updated_by: Optional[str] = None

    model_config = {"from_attributes": True}


class TeamsConfigUpdate(BaseModel):
    webhook_url: Optional[str] = None


class TeamsNotificationResponse(BaseModel):
    id: UUID
    order_id: UUID
    teams_message_id: Optional[str] = None
    sent_at: Optional[datetime] = None
    status: NotificationStatus
    error_message: Optional[str] = None
    retry_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
