from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.services.teams_service import TeamsService
from app.schemas.teams import TeamsConfigResponse, TeamsConfigUpdate

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("/config", response_model=TeamsConfigResponse)
def get_teams_config(db: Session = Depends(get_db)):
    """Get Teams webhook configuration (admin only)"""
    from app.models.teams_config import TeamsConfig
    from datetime import datetime

    config = db.query(TeamsConfig).first()

    if not config:
        # Return default empty config
        return TeamsConfigResponse(
            webhook_url=None,
            updated_at=datetime.utcnow(),
            updated_by=None
        )

    return config


@router.put("/config", response_model=TeamsConfigResponse)
def update_teams_config(
    config_update: TeamsConfigUpdate,
    updated_by: str = "admin",  # In real app, get from auth
    db: Session = Depends(get_db)
):
    """Update Teams webhook configuration (admin only)"""
    service = TeamsService(db)
    config = service.set_webhook_url(
        webhook_url=config_update.webhook_url,
        updated_by=updated_by
    )
    return config


@router.post("/test")
async def test_webhook(db: Session = Depends(get_db)):
    """Test Teams webhook (admin only)"""
    service = TeamsService(db)
    webhook_url = service.get_webhook_url()

    if not webhook_url:
        raise HTTPException(status_code=400, detail="Webhook URL not configured")

    import httpx
    test_message = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "Test Notification",
        "themeColor": "0078D4",
        "title": "Test Notification",
        "text": "This is a test notification from TechHub Delivery Workflow App"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(webhook_url, json=test_message, timeout=10.0)
            response.raise_for_status()
            return {"success": True, "message": "Test notification sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test: {str(e)}")
