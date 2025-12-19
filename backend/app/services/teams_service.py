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
        return await self._send_notification(order, deliverer, "in_delivery")

    async def send_ready_notification(self, order: Order) -> TeamsNotification:
        """Send Teams notification when order is ready for delivery"""
        return await self._send_notification(order, None, "ready")

    async def _send_notification(
        self,
        order: Order,
        deliverer: Optional[str],
        notification_type: str
    ) -> TeamsNotification:
        webhook_url = self.get_webhook_url()
        if not webhook_url:
            raise ValueError("Teams webhook URL not configured")

        existing = self.db.query(TeamsNotification).filter(
            and_(
                TeamsNotification.order_id == order.id,
                TeamsNotification.notification_type == notification_type,
                TeamsNotification.status == NotificationStatus.SENT,
                TeamsNotification.sent_at.isnot(None)
            )
        ).order_by(TeamsNotification.sent_at.desc()).first()

        if existing and existing.sent_at:
            time_diff = (datetime.utcnow() - existing.sent_at).total_seconds()
            if time_diff < 60:
                return existing

        notification = TeamsNotification(
            order_id=order.id,
            status=NotificationStatus.PENDING,
            webhook_url=webhook_url,
            notification_type=notification_type
        )
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)

        try:
            message = self._build_message(order, deliverer, notification_type)

            async with httpx.AsyncClient() as client:
                response = await client.post(webhook_url, json=message, timeout=10.0)
                response.raise_for_status()

                notification.status = NotificationStatus.SENT
                notification.sent_at = datetime.utcnow()
                try:
                    response_data = response.json()
                    notification.teams_message_id = response_data.get("id")
                except Exception:
                    pass

                self.db.commit()
                self.db.refresh(notification)
                return notification

        except Exception as e:
            notification.status = NotificationStatus.FAILED
            notification.error_message = str(e)
            self.db.commit()
            self.db.refresh(notification)
            raise

    def _build_message(
        self,
        order: Order,
        deliverer: Optional[str],
        notification_type: str
    ) -> dict:
        """Build Teams webhook message"""
        if notification_type == "ready":
            summary = f"Order {order.inflow_order_id} - Ready for Delivery"
            title = "Order Ready for Delivery"
            status_text = "Ready for delivery"
        else:
            summary = f"Order {order.inflow_order_id} - Out for Delivery"
            title = "Order Out for Delivery"
            status_text = "Out for delivery"

        message = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "summary": summary,
            "themeColor": "0078D4",
            "title": title,
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
                            "value": status_text
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
