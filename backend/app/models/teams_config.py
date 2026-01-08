import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean

from app.database import Base


class TeamsConfig(Base):
    __tablename__ = "teams_config"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    webhook_url = Column(String(500), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(String(255), nullable=True)
