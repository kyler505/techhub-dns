import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Enum as SQLEnum, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class OrderStatus(str, enum.Enum):
    PRE_DELIVERY = "PreDelivery"
    IN_DELIVERY = "InDelivery"
    DELIVERED = "Delivered"
    ISSUE = "Issue"


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inflow_order_id = Column(String, unique=True, nullable=False, index=True)  # e.g., "TH3270"
    inflow_sales_order_id = Column(String, nullable=True)  # UUID from Inflow
    recipient_name = Column(String, nullable=True)
    recipient_contact = Column(String, nullable=True)  # email
    delivery_location = Column(String, nullable=True)  # building/room or shipping address
    po_number = Column(String, nullable=True)
    status = Column(SQLEnum(OrderStatus), nullable=False, default=OrderStatus.PRE_DELIVERY, index=True)
    assigned_deliverer = Column(String, nullable=True)
    issue_reason = Column(Text, nullable=True)
    inflow_data = Column(JSONB, nullable=True)  # Full Inflow payload
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    audit_logs = relationship("AuditLog", back_populates="order", cascade="all, delete-orphan")
    teams_notifications = relationship("TeamsNotification", back_populates="order", cascade="all, delete-orphan")
