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
        # We check enabled status dynamically via SystemSettingService
        pass

    @property
    def is_enabled(self) -> bool:
        """Check if teams recipient notifications are enabled in system settings."""
        from app.services.system_setting_service import SystemSettingService, SETTING_TEAMS_RECIPIENT_ENABLED
        return SystemSettingService.is_setting_enabled(SETTING_TEAMS_RECIPIENT_ENABLED)

    def is_configured(self) -> bool:
        """Check if service is configured and enabled."""
        if not self.is_enabled:
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

    def notify_orders_in_delivery(self, orders: List, force: bool = False):
        """
        Trigger Teams notifications for a list of orders in the background.
        Calculates item names and recipient info for each order.
        """
        if not self.is_configured() and not force:
            logger.info("Teams recipient notifications skipped: service not configured or disabled")
            return

        from app.services.background_tasks import run_in_background

        def _notify_task():
            for order in orders:
                try:
                    # Get item names from inflow_data or use generic fallback
                    item_names = []
                    if order.inflow_data and "lines" in order.inflow_data:
                        item_names = [line.get("productName", "Item") for line in order.inflow_data.get("lines", [])]

                    self.send_delivery_notification(
                        recipient_email=order.recipient_contact,
                        recipient_name=order.recipient_name,
                        order_number=order.inflow_order_id,
                        delivery_runner=order.assigned_deliverer or "TechHub Staff",
                        estimated_time="Shortly",
                        order_items=item_names,
                        force=force
                    )
                except Exception as ex:
                    logger.error(f"Failed to trigger Teams notification for {getattr(order, 'inflow_order_id', 'unknown')}: {ex}")

        run_in_background(_notify_task, task_name="batch_teams_notifications")


teams_recipient_service = TeamsRecipientService()
