import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, Integer, JSON
import enum

from app.database import Base


class WebhookStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    failed = "failed"


class InflowWebhook(Base):
    __tablename__ = "inflow_webhooks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    webhook_id = Column(String(255), unique=True, nullable=False, index=True)  # Inflow's webhook ID
    url = Column(String(500), nullable=False)  # Our webhook endpoint URL
    events = Column(JSON, nullable=False)  # Array of subscribed events
    status = Column(SQLEnum(WebhookStatus), nullable=False, default=WebhookStatus.active, index=True)
    last_received_at = Column(DateTime, nullable=True)  # Last successful webhook receipt
    failure_count = Column(Integer, nullable=False, default=0)  # Track failures
    secret = Column(String(255), nullable=True)  # For signature verification
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
