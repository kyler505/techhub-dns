import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

print("Attempting to import app...")
try:
    from app.main import app
    print("Successfully imported app.main")
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)
except Exception as e:
    print(f"An error occurred: {e}")
    sys.exit(1)

print("Attempting to import services...")
try:
    # Verify TeamsRecipientService exists
    from app.services.teams_recipient_service import teams_recipient_service, TeamsRecipientService
    print("Successfully imported TeamsRecipientService")

    # Check if it has the expected method
    if hasattr(teams_recipient_service, 'send_delivery_notification'):
        print("Verified: send_delivery_notification method exists")
    else:
        print("ERROR: send_delivery_notification method missing")
        sys.exit(1)

    print("Successfully verified services")
except ImportError as e:
    print(f"Service import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Verification Check failed: {e}")
    sys.exit(1)

print("Verification complete.")
