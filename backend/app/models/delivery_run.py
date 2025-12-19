import uuid
from datetime import datetime
import enum

from sqlalchemy import Column, String, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.database import Base


class VehicleEnum(str, enum.Enum):
    VAN = "van"
    GOLF_CART = "golf_cart"


class DeliveryRunStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class DeliveryRun(Base):
    __tablename__ = "delivery_runs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    runner = Column(String, nullable=False)
    vehicle = Column(SQLEnum(VehicleEnum, name="vehicle_enum"), nullable=False)
    status = Column(SQLEnum(DeliveryRunStatus, name="delivery_run_status"), nullable=False, default=DeliveryRunStatus.ACTIVE)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Orders assigned to this run
    orders = relationship("Order", back_populates="delivery_run")
