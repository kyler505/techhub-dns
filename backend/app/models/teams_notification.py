import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, Integer, Text, ForeignKey
import enum

from app.database import Base


class NotificationStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class TeamsNotification(Base):
    __tablename__ = "teams_notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False, index=True)
    teams_message_id = Column(String(255), nullable=True, index=True)
    sent_at = Column(DateTime, nullable=True)
    status = Column(SQLEnum(NotificationStatus, name="notificationstatus"), nullable=False, default=NotificationStatus.PENDING, index=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    webhook_url = Column(String(500), nullable=True)
    notification_type = Column(String(50), nullable=False, default="in_delivery", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
