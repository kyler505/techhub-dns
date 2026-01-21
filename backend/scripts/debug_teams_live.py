import sys
import os
import logging
import json
import base64
import requests # Use requests directly to avoid service wrapper logic if needed, or use service

# Add backend to path
sys.path.append(os.getcwd())

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def debug_teams_direct():
    """
    Debugs Teams messaging by making raw Graph API calls and printing FULL responses.
    """
    try:
        from app.services.graph_service import graph_service
        from app.config import settings

        print("--- Configuration Check ---")
        print(f"Tenant ID: {settings.azure_tenant_id}")
        print(f"Client ID: {settings.azure_client_id}")
        if settings.azure_client_secret:
            print(f"Client Secret: [PRESENT] (Len: {len(settings.azure_client_secret)})")
        else:
            print("Client Secret: [MISSING]")

        if not graph_service.is_configured():
            print("ERROR: Graph Service is not configured properly.")
            return

        print("\n--- Token Acquisition ---")
        try:
            token = graph_service._get_access_token()
            print("Token acquired successfully.")
            # Verify scopes in token? (Hard to do without decoding, but we trust the response)
        except Exception as e:
            print(f"CRITICAL ERROR acquiring token: {e}")
            return

        print("\n--- User Lookup ---")
        # Ask for email
        recipient_email = "kcao@tamu.edu" # Default test
        if len(sys.argv) > 1:
            recipient_email = sys.argv[1]

        print(f"Looking up user: {recipient_email}")

        user_url = f"https://graph.microsoft.com/v1.0/users/{recipient_email}"
        headers = {"Authorization": f"Bearer {token}"}

        response = requests.get(user_url, headers=headers)
        print(f"User Lookup Status: {response.status_code}")

        if response.status_code != 200:
            print(f"User Lookup Response: {response.text}")
            return

        user_data = response.json()
        recipient_id = user_data.get("id")
        user_principal_name = user_data.get("userPrincipalName")
        print(f"Found User ID: {recipient_id}")
        print(f"User Principal: {user_principal_name}")

        print("\n--- Chat Creation (POST /chats) ---")
        chat_url = "https://graph.microsoft.com/v1.0/chats"

        # Payload exactly as per docs
        chat_payload = {
            "chatType": "oneOnOne",
            "members": [
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "roles": ["owner"],
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{recipient_id}')"
                    # Note: trying single quotes syntax which is sometimes preferred
                }
            ]
        }

        print(f"Payload: {json.dumps(chat_payload, indent=2)}")

        chat_response = requests.post(chat_url, headers=headers, json=chat_payload)
        print(f"Chat Creation Status: {chat_response.status_code}")
        print(f"Chat Creation Response: {chat_response.text}")

        if chat_response.status_code not in [200, 201]:
            print("!!! FAILED TO CREATE CHAT !!!")
            return

        chat_data = chat_response.json()
        chat_id = chat_data.get("id")
        print(f"Chat ID: {chat_id}")

        print("\n--- Send Message (POST /chats/{id}/messages) ---")
        msg_url = f"https://graph.microsoft.com/v1.0/chats/{chat_id}/messages"
        msg_payload = {
            "body": {
                "contentType": "html",
                "content": "<p>This is a <strong>DEBUG</strong> message from the TechHub Delivery System.</p>"
            }
        }

        msg_response = requests.post(msg_url, headers=headers, json=msg_payload)
        print(f"Message Send Status: {msg_response.status_code}")
        print(f"Message Send Response: {msg_response.text}")

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_teams_direct()
