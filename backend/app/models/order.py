import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Enum as SQLEnum, JSON, ForeignKey
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

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    inflow_order_id = Column(String(255), unique=True, nullable=False, index=True)  # e.g., "TH3270"
    inflow_sales_order_id = Column(String(255), nullable=True)  # UUID from Inflow
    recipient_name = Column(String(255), nullable=True)
    recipient_contact = Column(String(255), nullable=True)  # email
    delivery_location = Column(String(500), nullable=True)  # building/room or shipping address
    po_number = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default=OrderStatus.PICKED.value, index=True)
    assigned_deliverer = Column(String(255), nullable=True)
    issue_reason = Column(Text, nullable=True)
    tagged_at = Column(DateTime, nullable=True)
    tagged_by = Column(String(255), nullable=True)
    tag_data = Column(JSON, nullable=True)
    picklist_generated_at = Column(DateTime, nullable=True)
    picklist_generated_by = Column(String(255), nullable=True)
    picklist_path = Column(String(500), nullable=True)
    delivery_run_id = Column(String(36), ForeignKey('delivery_runs.id'), nullable=True, index=True)
    qa_completed_at = Column(DateTime, nullable=True)
    qa_completed_by = Column(String(255), nullable=True)
    qa_data = Column(JSON, nullable=True)
    qa_path = Column(String(500), nullable=True)
    qa_method = Column(String(50), nullable=True)  # "Delivery" or "Shipping"
    signature_captured_at = Column(DateTime, nullable=True)
    signed_picklist_path = Column(String(500), nullable=True)
    # Order Details PDF fields
    order_details_path = Column(String(500), nullable=True)
    order_details_generated_at = Column(DateTime, nullable=True)
    # Shipping workflow fields
    shipping_workflow_status = Column(String(50), nullable=True, default=ShippingWorkflowStatus.WORK_AREA.value)
    shipping_workflow_status_updated_at = Column(DateTime, nullable=True)
    shipping_workflow_status_updated_by = Column(String(255), nullable=True)
    shipped_to_carrier_at = Column(DateTime, nullable=True)
    shipped_to_carrier_by = Column(String(255), nullable=True)
    carrier_name = Column(String(100), nullable=True)  # "FedEx", "UPS", etc.
    tracking_number = Column(String(255), nullable=True)
    inflow_data = Column(JSON, nullable=True)  # Full Inflow payload
    # Remainder order tracking
    parent_order_id = Column(String(36), nullable=True, index=True)  # If this is a remainder, points to parent
    has_remainder = Column(String(1), nullable=True, default=None)  # 'Y' if this order has a remainder
    remainder_order_id = Column(String(36), nullable=True)  # Points to the remainder order
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    audit_logs = relationship("AuditLog", back_populates="order", cascade="all, delete-orphan")
    teams_notifications = relationship("TeamsNotification", back_populates="order", cascade="all, delete-orphan")
    delivery_run = relationship("DeliveryRun", back_populates="orders")
