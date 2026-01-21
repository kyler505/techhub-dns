import logging
from typing import Optional, List
from datetime import datetime
import json

from app.config import settings
from app.services.graph_service import graph_service


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
        Send a delivery notification by dropping a JSON file in the SharePoint queue.
        This triggers a Power Automate Flow to send the actual Teams message.

        Args:
            recipient_email: Email address of the recipient
            recipient_name: Name of the recipient
            order_number: Order number (e.g., TH1234)
            delivery_runner: Name of the person delivering
            estimated_time: Estimated delivery time
            order_items: List of items in the order
            force: If True, send even if disabled in settings
        """
        if not self.is_configured() and not force:
            logger.info(f"Teams recipient notifications disabled or not configured. Skipping for {order_number}.")
            return False

        if not recipient_email:
            logger.warning(f"No recipient email provided for order {order_number}. Skipping Teams notification.")
            return False

        # Construct payload matching the Power Automate "Parse JSON" schema
        # Schema fields: id, type, recipientEmail, recipientName, orderNumber,
        # deliveryRunner, estimatedTime, createdAt
        payload = {
            "id": f"notif_{order_number}_{int(datetime.now().timestamp())}",
            "type": "delivery_notification",
            "recipientEmail": recipient_email,
            "recipientName": recipient_name,
            "orderNumber": order_number,
            "deliveryRunner": delivery_runner,
            "estimatedTime": estimated_time,
            "createdAt": datetime.now().isoformat()
        }

        # note: order_items is not in the schema provided by user, so it is omitted from payload
        # The Flow likely has a generic message template.

        try:
            # Create file content
            file_content = json.dumps(payload, indent=2).encode('utf-8')
            filename = f"notification_{order_number}_{int(datetime.now().timestamp())}.json"

            # Upload to queue folder
            sharepoint_url = graph_service.upload_file_to_sharepoint(
                file_content=file_content,
                file_name=filename,
                folder_path=settings.teams_notification_queue_folder,
                initiated_by="system-delivery-process"
            )

            if sharepoint_url:
                logger.info(f"Queued Teams notification for {order_number} (File: {filename})")
                return True
            else:
                logger.error(f"Failed to queue Teams notification for {order_number}")
                return False

        except Exception as e:
            logger.error(f"Error queuing Teams notification for {order_number}: {e}")
            return False
