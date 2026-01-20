import logging
from typing import Optional, List
from datetime import datetime

from app.config import settings
from app.services.graph_service import graph_service
from app.models.order import Order

logger = logging.getLogger(__name__)


class TeamsRecipientService:
    """
    Service for sending Teams notifications to order recipients via Graph API.
    Replaces the legacy Power Automate flow.
    """

    def __init__(self):
        self.enabled = settings.teams_recipient_notifications_enabled

    def is_configured(self) -> bool:
        """Check if service is configured and enabled."""
        if not self.enabled:
            return False
        return graph_service.is_configured()

    def send_delivery_notification(
        self,
        recipient_email: str,
        recipient_name: str,
        order_number: str,
        delivery_runner: str,
        estimated_time: str = "Shortly",
        order_items: List[str] = None,
        force: bool = False
    ) -> bool:
        """
        Send a delivery notification to the recipient via Teams.

        Args:
            recipient_email: Email address of the recipient
            recipient_name: Name of the recipient
            order_number: Order number (e.g., TH1234)
            delivery_runner: Name of the person delivering
            estimated_time: Estimated delivery time
            order_items: List of items in the order
            force: If True, send even if disabled in settings

        Returns:
            True if sent successfully, False otherwise
        """
        if not self.is_configured() and not force:
            logger.info(f"Teams recipient notifications disabled or not configured. Skipping for {order_number}.")
            return False

        if not recipient_email:
            logger.warning(f"No recipient email provided for order {order_number}. Skipping Teams notification.")
            return False

        # Format item list
        items_html = ""
        if order_items:
            items_list = "".join([f"<li>{item}</li>" for item in order_items])
            items_html = f"<ul>{items_list}</ul>"

        # Build message using HTML
        message_content = f"""
        <h3>Your Order is Out for Delivery!</h3>
        <p>Hello <strong>{recipient_name}</strong>,</p>
        <p>Your order <strong>#{order_number}</strong> is currently out for delivery via the TechHub Delivery System.</p>

        <p><strong>Standard delivery location:</strong> Your office/lab</p>
        <p><strong>Deliverer:</strong> {delivery_runner}</p>
        <p><strong>Estimated Arrival:</strong> {estimated_time}</p>

        <p><strong>Order Contents:</strong></p>
        {items_html}

        <p>Please be present to sign for your items.</p>
        <p style="font-size: small; color: #888;">TechHub Delivery Notification System</p>
        """

        try:
            success = graph_service.send_teams_message(
                recipient_email=recipient_email,
                message_content=message_content,
                initiated_by="system-delivery-process"
            )

            if success:
                logger.info(f"Teams delivery notification sent to {recipient_email} for order {order_number}")
            else:
                logger.warning(f"Failed to send Teams delivery notification to {recipient_email} for order {order_number}")

            return success

        except Exception as e:
            logger.error(f"Error sending Teams delivery notification for {order_number}: {e}")
            return False


# Singleton instance
teams_recipient_service = TeamsRecipientService()
