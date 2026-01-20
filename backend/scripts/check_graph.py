import sys
import os
import logging
import json

# Add backend to path
sys.path.append(os.getcwd())

# Configure logging to stdout
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

print("Checking Graph API configuration...")

try:
    from app.services.graph_service import graph_service

    if not graph_service.is_configured():
        print("ERROR: Graph API not configured (missing env vars)")
        sys.exit(1)

    print("Attempting to acquire token...")
    try:
        token = graph_service._get_access_token()
        print(f"Token acquired. Length: {len(token)}")
    except Exception as e:
        print(f"FAILED to acquire token: {e}")
        sys.exit(1)

    print("Attempting to lookup user (me)...")
    # We can't lookup "me" with client credentials unless we know the ID or email.
    # Let's try to look up a user by email relative to the tenant, or just list users (top 1).
    try:
        result = graph_service._graph_request("GET", "/users?$top=1")
        if "value" in result and len(result["value"]) > 0:
            user = result["value"][0]
            print(f"Successfully fetched a user: {user.get('userPrincipalName')}")
        else:
            print("Fetched users list but it was empty.")

    except Exception as e:
        print(f"FAILED to fetch users: {e}")

    # Attempt to send a message to a dummy user (should fail with 404 but prove connectivity)
    print("Attempting to lookup dummy user...")
    try:
        dummy_email = "nonexistent_user_12345@tamu.edu"
        user_result = graph_service._graph_request("GET", f"/users/{dummy_email}")
        print(f"Result: {user_result}")
    except Exception as e:
        print(f"Expected failure looking up dummy user: {e}")

except Exception as e:
    print(f"Unexpected error: {e}")
    import traceback
    traceback.print_exc()
