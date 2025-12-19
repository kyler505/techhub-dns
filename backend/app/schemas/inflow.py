from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class InflowSyncResponse(BaseModel):
    success: bool
    orders_synced: int
    orders_created: int
    orders_updated: int
    message: str


class InflowSyncStatusResponse(BaseModel):
    last_sync_at: Optional[datetime] = None
    total_orders: int
    sync_enabled: bool


class WebhookRegisterRequest(BaseModel):
    url: str
    events: List[str] = ["orderCreated", "orderUpdated"]


class WebhookResponse(BaseModel):
    id: str
    webhook_id: str
    url: str
    events: List[str]
    status: str
    last_received_at: Optional[datetime] = None
    failure_count: int
    created_at: datetime
    updated_at: datetime


class WebhookListResponse(BaseModel):
    webhooks: List[WebhookResponse]
