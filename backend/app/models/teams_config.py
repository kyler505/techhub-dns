import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class TeamsConfig(Base):
    __tablename__ = "teams_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webhook_url = Column(String, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(String, nullable=True)
