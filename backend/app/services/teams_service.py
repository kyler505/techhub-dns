import httpx
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID

from app.models.teams_notification import TeamsNotification, NotificationStatus
from app.models.teams_config import TeamsConfig
from app.models.order import Order


class TeamsService:
    def __init__(self, db: Session):
        self.db = db

    def get_webhook_url(self) -> Optional[str]:
        """Get the configured Teams webhook URL"""
        config = self.db.query(TeamsConfig).first()
        if config:
            return config.webhook_url
        return None

    def set_webhook_url(self, webhook_url: Optional[str], updated_by: Optional[str] = None):
        """Set or update the Teams webhook URL"""
        config = self.db.query(TeamsConfig).first()
        if not config:
            config = TeamsConfig()
            self.db.add(config)

        config.webhook_url = webhook_url
        config.updated_at = datetime.utcnow()
        config.updated_by = updated_by
        self.db.commit()
        self.db.refresh(config)
        return config

    async def send_delivery_notification(
        self,
        order: Order,
        deliverer: Optional[str] = None
    ) -> TeamsNotification:
        """Send Teams notification for order in delivery (idempotent)"""
        webhook_url = self.get_webhook_url()
        if not webhook_url:
            raise ValueError("Teams webhook URL not configured")

        # Check for existing notification for this order/status transition
        # Use a time window to prevent duplicates (within same second)
        existing = self.db.query(TeamsNotification).filter(
            and_(
                TeamsNotification.order_id == order.id,
                TeamsNotification.status == NotificationStatus.SENT,
                TeamsNotification.sent_at.isnot(None)
            )
        ).order_by(TeamsNotification.sent_at.desc()).first()

        # If notification was sent recently (within last minute), don't send again
        if existing and existing.sent_at:
            time_diff = (datetime.utcnow() - existing.sent_at).total_seconds()
            if time_diff < 60:  # 1 minute window
                return existing

        # Create notification record with pending status
        notification = TeamsNotification(
            order_id=order.id,
            status=NotificationStatus.PENDING,
            webhook_url=webhook_url
        )
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)

        try:
            # Build notification message
            message = self._build_message(order, deliverer)

            # Send to Teams
            async with httpx.AsyncClient() as client:
                response = await client.post(webhook_url, json=message, timeout=10.0)
                response.raise_for_status()

                # Update notification record
                notification.status = NotificationStatus.SENT
                notification.sent_at = datetime.utcnow()
                # Try to extract message ID from response if available
                try:
                    response_data = response.json()
                    notification.teams_message_id = response_data.get("id")
                except:
                    pass

                self.db.commit()
                self.db.refresh(notification)
                return notification

        except Exception as e:
            # Update notification record with error
            notification.status = NotificationStatus.FAILED
            notification.error_message = str(e)
            self.db.commit()
            self.db.refresh(notification)
            raise

    def _build_message(self, order: Order, deliverer: Optional[str] = None) -> dict:
        """Build Teams webhook message"""
        deliverer_text = f"**Deliverer:** {deliverer}\n" if deliverer else ""

        message = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "summary": f"Order {order.inflow_order_id} - Out for Delivery",
            "themeColor": "0078D4",
            "title": "Order Out for Delivery",
            "sections": [
                {
                    "activityTitle": f"Order {order.inflow_order_id}",
                    "facts": [
                        {
                            "name": "Order ID:",
                            "value": order.inflow_order_id
                        },
                        {
                            "name": "Recipient:",
                            "value": order.recipient_name or "N/A"
                        },
                        {
                            "name": "Location:",
                            "value": order.delivery_location or "N/A"
                        },
                        {
                            "name": "Status:",
                            "value": "Out for delivery"
                        }
                    ]
                }
            ]
        }

        if deliverer:
            message["sections"][0]["facts"].append({
                "name": "Deliverer:",
                "value": deliverer
            })

        return message

    async def retry_notification(self, notification_id: UUID) -> TeamsNotification:
        """Retry a failed notification"""
        notification = self.db.query(TeamsNotification).filter(
            TeamsNotification.id == notification_id
        ).first()

        if not notification:
            raise ValueError("Notification not found")

        if notification.status == NotificationStatus.SENT:
            raise ValueError("Notification already sent")

        order = self.db.query(Order).filter(Order.id == notification.order_id).first()
        if not order:
            raise ValueError("Order not found")

        # Reset notification
        notification.status = NotificationStatus.PENDING
        notification.error_message = None
        notification.retry_count += 1
        self.db.commit()

        # Resend
        return await self.send_delivery_notification(order, order.assigned_deliverer)

    def check_notification_sent(self, order_id: UUID) -> Optional[TeamsNotification]:
        """Check if notification was already sent for this order"""
        return self.db.query(TeamsNotification).filter(
            and_(
                TeamsNotification.order_id == order_id,
                TeamsNotification.status == NotificationStatus.SENT
            )
        ).order_by(TeamsNotification.sent_at.desc()).first()
