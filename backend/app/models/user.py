"""User model for SAML-authenticated TAMU users."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    """
    Represents a TAMU user authenticated via SAML.

    Attributes:
        id: Internal UUID primary key
        tamu_oid: Microsoft Object ID (unique, never changes)
        email: User's TAMU email (NetID@tamu.edu)
        display_name: User's full name
        department: User's primary department
        employee_id: TAMU UIN (optional)
        created_at: First login timestamp
        last_login_at: Most recent login timestamp
    """
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tamu_oid = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)
    employee_id = Column(String(50), nullable=True)  # TAMU UIN
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "department": self.department,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }
