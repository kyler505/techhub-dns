from flask import Blueprint, jsonify
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.schemas.audit import AuditLogResponse
from app.models.audit_log import AuditLog

bp = Blueprint('audit', __name__)
bp.strict_slashes = False


@bp.route("/order/<uuid:order_id>", methods=["GET"])
def get_order_audit(order_id):
    """Get audit log for an order"""
    with get_db() as db:
        audit_logs = db.query(AuditLog).filter(
            AuditLog.order_id == order_id
        ).order_by(AuditLog.timestamp.desc()).all()

        return jsonify([AuditLogResponse.model_validate(log).model_dump() for log in audit_logs])
