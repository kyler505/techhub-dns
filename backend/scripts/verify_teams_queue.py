import sys
import os
import logging
import json
import base64
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.getcwd())

# Configure logging
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

def debug_teams_queue_upload():
    """
    Debugs Teams messaging by queueing a JSON file to SharePoint.
    """
    try:
        print(f"DEBUG: sys.path: {sys.path}")
        try:
            import app.services.teams_recipient_service
            print(f"DEBUG: module imported. dir: {dir(app.services.teams_recipient_service)}")
        except Exception as e:
            print(f"DEBUG: import failed: {e}")

        from app.services.teams_recipient_service import TeamsRecipientService
        from app.config import settings

        # Instantiate manualy to bypass import error
        teams_recipient_service = TeamsRecipientService()

        print("--- Configuration Check ---")
        print(f"Tenant ID: {settings.azure_tenant_id}")
        print(f"SharePoint Configured: {bool(settings.sharepoint_site_url)}")
        print(f"Teams Queue Folder: {settings.teams_notification_queue_folder}")
        print(f"Teams Notifications Enabled: {settings.teams_recipient_notifications_enabled}")

        print("\n--- Sending Test Notification via Queue ---")
        recipient_email = "kcao@tamu.edu" # Default test
        if len(sys.argv) > 1:
            recipient_email = sys.argv[1]

        success = teams_recipient_service.send_delivery_notification(
            recipient_email=recipient_email,
            recipient_name="Debug User",
            order_number="DEBUG-ORDER-999",
            delivery_runner="Debug Runner",
            estimated_time="Right now",
            force=True
        )

        if success:
            print("SUCCESS: Notification queued to SharePoint.")
            print(f"Check SharePoint folder: {settings.sharepoint_folder_path}/{settings.teams_notification_queue_folder}")
        else:
            print("FAILURE: Could not queue notification.")

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_teams_queue_upload()
