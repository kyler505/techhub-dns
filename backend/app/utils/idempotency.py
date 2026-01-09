from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from uuid import UUID

from app.models.teams_notification import TeamsNotification, NotificationStatus


def check_recent_notification(
    db: Session,
    order_id: UUID,
    time_window_seconds: int = 60
) -> Optional[TeamsNotification]:
    """
    Check if a notification was sent recently for this order.
    Prevents duplicate notifications within the time window.
    """
    cutoff_time = datetime.utcnow() - timedelta(seconds=time_window_seconds)
    order_id_str = str(order_id)

    recent = db.query(TeamsNotification).filter(
        TeamsNotification.order_id == order_id_str,
        TeamsNotification.status == NotificationStatus.SENT,
        TeamsNotification.sent_at >= cutoff_time
    ).order_by(TeamsNotification.sent_at.desc()).first()

    return recent
