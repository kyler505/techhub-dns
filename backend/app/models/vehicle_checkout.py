import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text

from app.database import Base


class VehicleCheckout(Base):
    __tablename__ = "vehicle_checkouts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vehicle = Column(String(50), nullable=False, index=True)

    checked_out_by = Column(String(255), nullable=False)
    checked_out_by_user_id = Column(String(36), nullable=True, index=True)
    checked_out_by_email = Column(String(255), nullable=True)
    checked_out_by_display_name = Column(String(255), nullable=True)
    purpose = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    checked_out_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    checked_in_at = Column(DateTime, nullable=True, index=True)
    checked_in_by = Column(String(255), nullable=True)
    checked_in_by_user_id = Column(String(36), nullable=True)
    checked_in_by_email = Column(String(255), nullable=True)
    checked_in_by_display_name = Column(String(255), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
