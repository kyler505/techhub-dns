from flask import Blueprint, request, jsonify, abort
from sqlalchemy.orm import Session
from uuid import UUID
import httpx

from app.database import get_db
from app.services.teams_service import TeamsService
from app.schemas.teams import TeamsConfigResponse, TeamsConfigUpdate

bp = Blueprint('teams', __name__)
bp.strict_slashes = False


@bp.route("/config", methods=["GET"])
def get_teams_config():
    """Get Teams webhook configuration (admin only)"""
    from app.models.teams_config import TeamsConfig
    from datetime import datetime

    with get_db() as db:
        config = db.query(TeamsConfig).first()

        if not config:
            response = TeamsConfigResponse(
                webhook_url=None,
                updated_at=datetime.utcnow(),
                updated_by=None
            )
            return jsonify(response.model_dump())

        return jsonify(TeamsConfigResponse.model_validate(config).model_dump())


@bp.route("/config", methods=["PUT"])
def update_teams_config():
    """Update Teams webhook configuration (admin only)"""
    data = request.get_json()
    updated_by = request.args.get('updated_by', 'admin')

    with get_db() as db:
        service = TeamsService(db)
        config_update = TeamsConfigUpdate(**data)
        config = service.set_webhook_url(
            webhook_url=config_update.webhook_url,
            updated_by=updated_by
        )
        return jsonify(TeamsConfigResponse.model_validate(config).model_dump())


@bp.route("/test", methods=["POST"])
def test_webhook():
    """Test Teams webhook (admin only)"""
    with get_db() as db:
        service = TeamsService(db)
        webhook_url = service.get_webhook_url()

        if not webhook_url:
            abort(400, description="Webhook URL not configured")

        test_message = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "summary": "Test Notification",
            "themeColor": "0078D4",
            "title": "Test Notification",
            "text": "This is a test notification from TechHub Delivery Workflow App"
        }

        try:
            with httpx.Client() as client:
                response = client.post(webhook_url, json=test_message, timeout=10.0)
                response.raise_for_status()
                return jsonify({"success": True, "message": "Test notification sent successfully"})
        except Exception as e:
            abort(500, description=f"Failed to send test: {str(e)}")
