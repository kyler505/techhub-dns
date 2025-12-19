import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class NotificationStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class TeamsNotification(Base):
    __tablename__ = "teams_notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True)
    teams_message_id = Column(String, nullable=True, index=True)
    sent_at = Column(DateTime, nullable=True)
    status = Column(SQLEnum(NotificationStatus), nullable=False, default=NotificationStatus.PENDING, index=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    webhook_url = Column(String, nullable=True)  # Track which config was used
    notification_type = Column(String, nullable=False, default="in_delivery", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationship
    order = relationship("Order", back_populates="teams_notifications")
