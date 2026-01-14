"""Session model for user login sessions."""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.config import settings


class Session(Base):
    """
    Represents a user login session.

    Each device/browser gets its own session, allowing users to:
    - See all active sessions
    - Revoke individual sessions
    - Sign out everywhere

    Attributes:
        id: Session ID (stored in cookie)
        user_id: Foreign key to users table
        created_at: Session creation time
        expires_at: Session expiration time
        last_seen_at: Last activity timestamp (for rolling expiry)
        revoked_at: If set, session was explicitly revoked
        user_agent: Browser/device info
        ip_address: Client IP address
    """
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)
    user_agent = Column(String(500), nullable=True)
    ip_address = Column(String(45), nullable=True)  # Supports IPv6

    # Relationships
    user = relationship("User", back_populates="sessions")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.expires_at:
            self.expires_at = datetime.utcnow() + timedelta(hours=settings.session_max_age_hours)

    def is_valid(self) -> bool:
        """Check if session is still valid (not expired, not revoked)."""
        now = datetime.utcnow()
        if self.revoked_at:
            return False
        if self.expires_at and now > self.expires_at:
            return False
        return True

    def __repr__(self):
        return f"<Session {self.id[:8]}... user={self.user_id[:8]}...>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
            "is_current": False,  # Set by caller
        }
