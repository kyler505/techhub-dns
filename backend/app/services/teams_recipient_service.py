"""
Teams Recipient Notification Service using Power Automate.

This service sends Teams chat messages directly to order recipients
when their delivery is on its way.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class TeamsRecipientService:
    """Service for sending Teams notifications to recipients via Power Automate."""

    def __init__(self):
        self.enabled = settings.teams_recipient_notifications_enabled
        self.flow_url = settings.power_automate_flow_url

    def is_configured(self) -> bool:
        """Check if the service is properly configured."""
        return bool(self.enabled and self.flow_url)

    def send_delivery_notification(
        self,
        recipient_email: str,
        recipient_name: str,
        order_number: str,
        delivery_runner: str,
        estimated_time: Optional[str] = None,
        order_items: Optional[List[str]] = None
    ) -> bool:
        """
        Send a Teams notification to the recipient about their delivery.

        Args:
            recipient_email: Recipient's TAMU email (must have Teams)
            recipient_name: Recipient's display name
            order_number: The order number (e.g., TH4013)
            delivery_runner: Name of the person delivering
            estimated_time: Optional estimated delivery time
            order_items: Optional list of item names in the order

        Returns:
            True if notification sent successfully, False otherwise
        """
        if not self.enabled:
            logger.info("Teams recipient notifications are disabled")
            return False

        if not self.flow_url:
            logger.warning("Power Automate flow URL not configured")
            return False

        # Build the payload for Power Automate
        payload = {
            "recipientEmail": recipient_email,
            "recipientName": recipient_name,
            "orderNumber": order_number,
            "deliveryRunner": delivery_runner,
            "timestamp": datetime.now().isoformat(),
        }

        if estimated_time:
            payload["estimatedTime"] = estimated_time

        if order_items:
            payload["orderItems"] = order_items

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    self.flow_url,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )

                if response.status_code in (200, 202):
                    logger.info(
                        f"Teams notification sent to {recipient_email} for order {order_number}"
                    )
                    return True
                else:
                    logger.error(
                        f"Power Automate returned {response.status_code}: {response.text}"
                    )
                    return False

        except httpx.TimeoutException:
            logger.error(f"Timeout sending Teams notification to {recipient_email}")
            return False
        except httpx.RequestError as e:
            logger.error(f"Error sending Teams notification: {e}")
            return False

    def send_bulk_delivery_notifications(
        self,
        orders: List[Dict[str, Any]],
        delivery_runner: str
    ) -> Dict[str, bool]:
        """
        Send notifications for multiple orders (e.g., when starting a delivery run).

        Args:
            orders: List of order dicts with recipient_email, recipient_name, order_number
            delivery_runner: Name of the person delivering

        Returns:
            Dict mapping order_number to success status
        """
        results = {}

        for order in orders:
            order_number = order.get("order_number") or order.get("inflow_order_id")
            recipient_email = order.get("recipient_email") or order.get("recipient_contact")
            recipient_name = order.get("recipient_name", "Customer")

            if not recipient_email:
                logger.warning(f"No email for order {order_number}, skipping notification")
                results[order_number] = False
                continue

            success = self.send_delivery_notification(
                recipient_email=recipient_email,
                recipient_name=recipient_name,
                order_number=order_number,
                delivery_runner=delivery_runner
            )
            results[order_number] = success

        return results


# Singleton instance
teams_recipient_service = TeamsRecipientService()
