import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    __table_args__ = (
        Index("ix_order_status_history_order_id_changed_at", "order_id", "changed_at"),
        Index("ix_order_status_history_changed_at", "changed_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    actor_user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status_metadata = Column(JSON, nullable=True, name="metadata")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    order = relationship("Order", back_populates="status_history")
