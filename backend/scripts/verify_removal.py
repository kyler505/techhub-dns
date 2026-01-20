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
    from app.services.order_service import OrderService
    from app.services.inflow_service import InflowService
    # Ensure TeamsService is NOT importable from old locations (verification of removal)
    try:
        from app.services.teams_service import TeamsService
        print("ERROR: TeamsService still exists!")
        sys.exit(1)
    except ImportError:
        print("Verified: TeamsService is gone.")

    print("Successfully imported services")
except Exception as e:
    print(f"Service import error: {e}")
    sys.exit(1)

print("Verification complete.")
