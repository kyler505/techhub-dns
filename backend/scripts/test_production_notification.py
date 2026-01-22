import os
import sys
import logging
import json
from datetime import datetime

# Setup path
sys.path.insert(0, os.getcwd())
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.services.teams_recipient_service import teams_recipient_service
from app.models.models import Order # Assuming Order model exists

def test_notification():
    print("Testing Teams Notification on Production...")

    # Try to send a notification for a test case
    recipient_email = "kyler.cao@tamu.edu" # Using a known valid email from previous logs
    recipient_name = "Kyler Cao (Test)"
    order_number = "TEST-DEPLOY-1"

    success = teams_recipient_service.send_delivery_notification(
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        order_number=order_number,
        delivery_runner="Antigravity Deploy Bot",
        force=True # Force even if disabled to verify the mechanism
    )

    if success:
        print(f"✓ SUCCESS: Notification queued for {order_number}")
    else:
        print(f"✗ FAILURE: Notification failed for {order_number}. Check logs.")

if __name__ == "__main__":
    test_notification()
