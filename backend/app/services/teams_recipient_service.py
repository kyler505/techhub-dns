"""
Teams Recipient Notification Service using SharePoint Queue.

Flow:
1. App writes notification request JSON to SharePoint (teams-queue folder)
2. Power Automate triggers on new file in SharePoint
3. Flow sends Teams chat message to recipient
4. Flow deletes the processed file

This bypasses SAS authentication issues with HTTP triggers.
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from uuid import uuid4

from app.config import settings

logger = logging.getLogger(__name__)


class TeamsRecipientService:
    """Service for sending Teams notifications via SharePoint queue."""

    def __init__(self):
        self.enabled = settings.teams_recipient_notifications_enabled

    def is_configured(self) -> bool:
        """Check if the service is properly configured (SharePoint must be enabled)."""
        try:
            from app.services.sharepoint_service import get_sharepoint_service
            sp_service = get_sharepoint_service()
            return self.enabled and sp_service.is_enabled
        except Exception:
            return False

    def _queue_notification_to_sharepoint(
        self,
        recipient_email: str,
        recipient_name: str,
        order_number: str,
        delivery_runner: str,
        estimated_time: Optional[str] = None,
        order_items: Optional[List[str]] = None
    ) -> bool:
        """
        Queue a Teams notification request to SharePoint.

        Writes a JSON file to the teams-queue folder.
        Power Automate flow monitors this folder and sends Teams messages.
        """
        from app.services.sharepoint_service import get_sharepoint_service

        try:
            sp_service = get_sharepoint_service()
            if not sp_service.is_enabled:
                logger.warning("SharePoint not enabled, cannot queue Teams notification")
                return False

            # Create notification request JSON
            request_id = str(uuid4())[:8]
            timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            filename = f"teams-{timestamp}-{request_id}.json"

            notification_request = {
                "id": request_id,
                "type": "delivery_notification",
                "recipientEmail": recipient_email,
                "recipientName": recipient_name,
                "orderNumber": order_number,
                "deliveryRunner": delivery_runner,
                "estimatedTime": estimated_time,
                "orderItems": order_items,
                "createdAt": datetime.utcnow().isoformat() + "Z",
                "status": "pending"
            }

            # Upload to teams-queue folder
            url = sp_service.upload_json(notification_request, "teams-queue", filename)
            logger.info(f"Teams notification queued to SharePoint: {url}")
            return True

        except Exception as e:
            logger.error(f"Failed to queue Teams notification to SharePoint: {e}")
            return False

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
        Queue a Teams notification to the recipient about their delivery.

        Args:
            recipient_email: Recipient's TAMU email (must have Teams)
            recipient_name: Recipient's display name
            order_number: The order number (e.g., TH4013)
            delivery_runner: Name of the person delivering
            estimated_time: Optional estimated delivery time
            order_items: Optional list of item names in the order
            force: If True, bypass the enabled check (for testing)

        Returns:
            True if notification queued successfully, False otherwise
        """
        if not force and not self.enabled:
            logger.info("Teams recipient notifications are disabled")
            return False

        return self._queue_notification_to_sharepoint(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            order_number=order_number,
            delivery_runner=delivery_runner,
            estimated_time=estimated_time,
            order_items=order_items
        )

    def send_bulk_delivery_notifications(
        self,
        orders: List[Dict[str, Any]],
        delivery_runner: str
    ) -> Dict[str, bool]:
        """
        Queue notifications for multiple orders (e.g., when starting a delivery run).

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
