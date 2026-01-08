import uuid
from datetime import datetime
import enum

from sqlalchemy import Column, String, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database import Base


class VehicleEnum(enum.Enum):
    VAN = "van"
    GOLF_CART = "golf_cart"


class DeliveryRunStatus(enum.Enum):
    ACTIVE = "Active"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class DeliveryRun(Base):
    __tablename__ = "delivery_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    runner = Column(String(255), nullable=False)
    vehicle = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False, default=DeliveryRunStatus.ACTIVE.value)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Orders assigned to this run
    orders = relationship("Order", back_populates="delivery_run")
