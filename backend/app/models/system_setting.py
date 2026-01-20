"""
SystemSetting model for storing application-wide configuration.

These settings can be toggled dynamically from the Admin Panel
without requiring environment variable changes or redeployment.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text

from app.database import Base


class SystemSetting(Base):
    """Key-value store for system-wide settings."""

    __tablename__ = "system_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)  # Stored as string, parsed by app
    description = Column(String(500), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(String(255), nullable=True)

    # Common settings keys (for reference)
    # - email_notifications_enabled: "true" / "false"
    # - teams_recipient_notifications_enabled: "true" / "false"
