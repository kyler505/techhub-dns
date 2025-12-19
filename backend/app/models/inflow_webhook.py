import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from app.database import Base


class WebhookStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    FAILED = "failed"


class InflowWebhook(Base):
    __tablename__ = "inflow_webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webhook_id = Column(String, unique=True, nullable=False, index=True)  # Inflow's webhook ID
    url = Column(String, nullable=False)  # Our webhook endpoint URL
    events = Column(JSONB, nullable=False)  # Array of subscribed events
    status = Column(SQLEnum(WebhookStatus), nullable=False, default=WebhookStatus.ACTIVE, index=True)
    last_received_at = Column(DateTime, nullable=True)  # Last successful webhook receipt
    failure_count = Column(Integer, nullable=False, default=0)  # Track failures
    secret = Column(String, nullable=True)  # For signature verification
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
