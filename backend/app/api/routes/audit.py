from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.schemas.audit import AuditLogResponse
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/order/{order_id}", response_model=list[AuditLogResponse])
def get_order_audit(order_id: UUID, db: Session = Depends(get_db)):
    """Get audit log for an order"""
    audit_logs = db.query(AuditLog).filter(
        AuditLog.order_id == order_id
    ).order_by(AuditLog.timestamp.desc()).all()

    return audit_logs
