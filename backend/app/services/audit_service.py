from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.audit_log import SystemAuditLog


class AuditService:
    """Service for comprehensive audit logging across all system operations"""

    def __init__(self, db: Session):
        self.db = db

    def log_action(self,
                   entity_type: str,
                   entity_id: str,
                   action: str,
                   user_id: Optional[str] = None,
                   user_role: Optional[str] = None,
                   old_value: Optional[Dict[str, Any]] = None,
                   new_value: Optional[Dict[str, Any]] = None,
                   description: Optional[str] = None,
                   audit_metadata: Optional[Dict[str, Any]] = None,
                   ip_address: Optional[str] = None,
                   user_agent: Optional[str] = None) -> SystemAuditLog:
        """
        Log a system action to the audit trail

        Args:
            entity_type: Type of entity ("order", "delivery_run", "user", etc.)
            entity_id: ID of the entity (as string)
            action: Action performed ("created", "updated", "deleted", etc.)
            user_id: ID of user who performed the action
            user_role: Role of the user
            old_value: Previous state of the entity
            new_value: New state of the entity
            description: Human-readable description
            metadata: Additional context data
            ip_address: Client IP address
            user_agent: Client user agent string

        Returns:
            The created audit log entry
        """

        audit_log = SystemAuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=user_id,
            user_role=user_role,
            old_value=old_value,
            new_value=new_value,
            description=description,
            audit_metadata=audit_metadata,
            ip_address=ip_address,
            user_agent=user_agent,
            timestamp=datetime.utcnow()
        )

        self.db.add(audit_log)
        return audit_log

    # Convenience methods for common entity types

    def log_order_action(self,
                         order_id: str,
                         action: str,
                         user_id: Optional[str] = None,
                         user_role: Optional[str] = None,
                         **kwargs) -> SystemAuditLog:
        """Log an order-related action"""
        return self.log_action("order", order_id, action, user_id, user_role, **kwargs)

    def log_delivery_run_action(self,
                               run_id: str,
                               action: str,
                               user_id: Optional[str] = None,
                               user_role: Optional[str] = None,
                               **kwargs) -> SystemAuditLog:
        """Log a delivery run-related action"""
        return self.log_action("delivery_run", run_id, action, user_id, user_role, **kwargs)

    def log_user_action(self,
                       user_id: str,
                       action: str,
                       performed_by: Optional[str] = None,
                       **kwargs) -> SystemAuditLog:
        """Log a user-related action"""
        return self.log_action("user", user_id, action, performed_by, **kwargs)

    def log_system_action(self,
                         action: str,
                         entity_id: str = "system",
                         user_id: Optional[str] = None,
                         **kwargs) -> SystemAuditLog:
        """Log a system-wide action"""
        return self.log_action("system", entity_id, action, user_id, **kwargs)
