import sys
import os
import logging

# Add backend to path
sys.path.append(os.getcwd())

# Configure logging
logging.basicConfig(level=logging.DEBUG)

print("Attempting to reproduce Teams Recipient error...")

try:
    from app.services.teams_recipient_service import teams_recipient_service

    # Mocking what the endpoint does
    recipient_email = "test@example.com" # Use a dummy, we expect it might fail or we want to see the error

    print(f"Calling send_delivery_notification for {recipient_email}...")
    success = teams_recipient_service.send_delivery_notification(
        recipient_email=recipient_email,
        recipient_name="Test User",
        order_number="TEST-123",
        delivery_runner="System Administrator",
        estimated_time="Currently (Test)",
        order_items=["Test Item 1", "Test Item 2"],
        force=True
    )

    print(f"Result: {success}")

except Exception as e:
    print(f"Caught exception: {e}")
    import traceback
    traceback.print_exc()

print("Done.")
