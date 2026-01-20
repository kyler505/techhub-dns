"""
Teams Recipient Notification Service using Microsoft Graph API.

Sends 1:1 Teams chat messages directly to order recipients using Graph API.
Replaces the previous SharePoint queue + Power Automate approach.

Requires Azure AD app with Chat.Create and ChatMessage.Send permissions.
"""

import logging
from typing import Dict, Any, Optional, List

from app.config import settings
from app.services.graph_service import graph_service

logger = logging.getLogger(__name__)


class TeamsRecipientService:
    """Service for sending Teams notifications via Graph API."""

    def __init__(self):
        self.enabled = settings.teams_recipient_notifications_enabled

    def is_configured(self) -> bool:
        """Check if the service is properly configured (Graph API must be configured)."""
        return self.enabled and graph_service.is_configured()

    def _build_delivery_message(
        self,
        recipient_name: str,
        order_number: str,
        delivery_runner: str,
        estimated_time: Optional[str] = None,
        order_items: Optional[List[str]] = None
    ) -> str:
        """
        Build an HTML message for delivery notification.

        Returns HTML string suitable for Teams chat message.
        """
        # Build items list if provided
        items_html = ""
        if order_items:
            items_list = "".join(f"<li>{item}</li>" for item in order_items)
            items_html = f"<br/><b>Items:</b><ul>{items_list}</ul>"

        # Build time info if provided
        time_html = ""
        if estimated_time:
            time_html = f"<br/><b>Estimated arrival:</b> {estimated_time}"

        message = f"""
<h3>🚚 TechHub Delivery Notification</h3>
<p>Hi {recipient_name},</p>
<p>Your TechHub order <b>{order_number}</b> is out for delivery!</p>
<p><b>Delivered by:</b> {delivery_runner}{time_html}</p>
{items_html}
<p>Please ensure someone is available to receive the delivery. If you have any questions, contact TechHub.</p>
<hr/>
<p style="font-size: 12px; color: #666;">TechHub Technology Services • WCDC • 474 Agronomy Rd</p>
"""
        return message

    def send_delivery_notification(
        self,
        recipient_email: str,
        recipient_name: str,
        order_number: str,
        delivery_runner: str,
        estimated_time: Optional[str] = None,
        order_items: Optional[List[str]] = None,
        force: bool = False
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
            force: If True, bypass the enabled check (for testing)

        Returns:
            True if notification sent successfully, False otherwise
        """
        if not force and not self.enabled:
            logger.info("Teams recipient notifications are disabled")
            return False

        if not graph_service.is_configured():
            logger.warning("Graph API not configured, cannot send Teams notification")
            return False

        # Build the message content
        message_html = self._build_delivery_message(
            recipient_name=recipient_name,
            order_number=order_number,
            delivery_runner=delivery_runner,
            estimated_time=estimated_time,
            order_items=order_items
        )

        # Send via Graph API
        return graph_service.send_teams_message(
            recipient_email=recipient_email,
            message_content=message_html,
            initiated_by=delivery_runner
        )

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
