import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class AuditLog(Base):
    """Legacy audit log for order status changes (backward compatibility)"""
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True)
    changed_by = Column(String, nullable=True)  # User identifier
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    reason = Column(Text, nullable=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    extra_metadata = Column(JSONB, nullable=True, name="metadata")  # Additional context - renamed to avoid SQLAlchemy conflict

    # Relationship
    order = relationship("Order", back_populates="audit_logs")


class SystemAuditLog(Base):
    """Comprehensive audit log for all system operations"""
    __tablename__ = "system_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Entity tracking
    entity_type = Column(String, nullable=False, index=True)  # "order", "delivery_run", "user", etc.
    entity_id = Column(String, nullable=False, index=True)    # UUID as string

    # Action details
    action = Column(String, nullable=False)                   # "created", "updated", "deleted", etc.
    description = Column(Text, nullable=True)                 # Human-readable description

    # User tracking
    user_id = Column(String, nullable=True)                   # Who performed the action
    user_role = Column(String, nullable=True)                 # Their role for context

    # State changes
    old_value = Column(JSONB, nullable=True)                  # Previous state
    new_value = Column(JSONB, nullable=True)                  # New state

    # Context and metadata
    audit_metadata = Column(JSONB, nullable=True, name="metadata")  # Additional context
    ip_address = Column(String, nullable=True)                # Client IP
    user_agent = Column(Text, nullable=True)                  # Browser/client info

    # Timestamps
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
