import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Enum as SQLEnum, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class OrderStatus(str, enum.Enum):
    PICKED = "picked"
    PRE_DELIVERY = "pre-delivery"
    IN_DELIVERY = "in-delivery"
    SHIPPING = "shipping"
    DELIVERED = "delivered"
    ISSUE = "issue"

    @property
    def display_name(self) -> str:
        return {
            "picked": "Picked",
            "pre-delivery": "Pre-Delivery",
            "in-delivery": "In Delivery",
            "shipping": "Shipping",
            "delivered": "Delivered",
            "issue": "Issue"
        }.get(self.value, self.value)


class ShippingWorkflowStatus(str, enum.Enum):
    WORK_AREA = "work_area"
    DOCK = "dock"
    SHIPPED = "shipped"

    @property
    def display_name(self) -> str:
        return {
            "work_area": "Work Area",
            "dock": "At Dock",
            "shipped": "Shipped to Carrier"
        }.get(self.value, self.value)


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inflow_order_id = Column(String, unique=True, nullable=False, index=True)  # e.g., "TH3270"
    inflow_sales_order_id = Column(String, nullable=True)  # UUID from Inflow
    recipient_name = Column(String, nullable=True)
    recipient_contact = Column(String, nullable=True)  # email
    delivery_location = Column(String, nullable=True)  # building/room or shipping address
    po_number = Column(String, nullable=True)
    status = Column(String, nullable=False, default=OrderStatus.PICKED.value, index=True)
    assigned_deliverer = Column(String, nullable=True)
    issue_reason = Column(Text, nullable=True)
    tagged_at = Column(DateTime, nullable=True)
    tagged_by = Column(String, nullable=True)
    tag_data = Column(JSONB, nullable=True)
    picklist_generated_at = Column(DateTime, nullable=True)
    picklist_generated_by = Column(String, nullable=True)
    picklist_path = Column(String, nullable=True)
    delivery_run_id = Column(UUID(as_uuid=True), ForeignKey('delivery_runs.id'), nullable=True, index=True)
    qa_completed_at = Column(DateTime, nullable=True)
    qa_completed_by = Column(String, nullable=True)
    qa_data = Column(JSONB, nullable=True)
    qa_path = Column(String, nullable=True)
    qa_method = Column(String, nullable=True)  # "Delivery" or "Shipping"
    signature_captured_at = Column(DateTime, nullable=True)
    signed_picklist_path = Column(String, nullable=True)
    # Shipping workflow fields
    shipping_workflow_status = Column(String, nullable=True, default=ShippingWorkflowStatus.WORK_AREA.value)
    shipping_workflow_status_updated_at = Column(DateTime, nullable=True)
    shipping_workflow_status_updated_by = Column(String, nullable=True)
    shipped_to_carrier_at = Column(DateTime, nullable=True)
    shipped_to_carrier_by = Column(String, nullable=True)
    carrier_name = Column(String, nullable=True)  # "FedEx", "UPS", etc.
    tracking_number = Column(String, nullable=True)
    inflow_data = Column(JSONB, nullable=True)  # Full Inflow payload
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    audit_logs = relationship("AuditLog", back_populates="order", cascade="all, delete-orphan")
    teams_notifications = relationship("TeamsNotification", back_populates="order", cascade="all, delete-orphan")
    delivery_run = relationship("DeliveryRun", back_populates="orders")
