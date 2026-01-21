import sys
import os
import logging
import json
import base64
import requests

# Add backend to path
sys.path.append(os.getcwd())

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def decode_jwt_payload(token):
    try:
        # JWT is header.payload.signature
        parts = token.split('.')
        if len(parts) != 3:
            return None

        payload_b64 = parts[1]
        # Adjust padding
        padding = '=' * (4 - len(payload_b64) % 4)
        payload_b64 += padding

        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes)
    except Exception as e:
        print(f"Error decoding token: {e}")
        return None

def debug_teams_2member():
    try:
        from app.services.graph_service import graph_service

        print("--- Token Acquisition ---")
        token = graph_service._get_access_token()
        print("Token acquired.")

        # Decode token to get OID (Service Principal ID)
        claims = decode_jwt_payload(token)
        if not claims:
            print("Failed to decode token claims.")
            return

        app_oid = claims.get("oid")
        print(f"App Object ID (oid): {app_oid}")
        if not app_oid:
            print("No 'oid' claim found in token!")
            return

        # Recipient
        recipient_email = "kcao@tamu.edu"
        user_url = f"https://graph.microsoft.com/v1.0/users/{recipient_email}"
        headers = {"Authorization": f"Bearer {token}"}

        print(f"Looking up user: {recipient_email}")
        response = requests.get(user_url, headers=headers)
        if response.status_code != 200:
            print(f"User Lookup Failed: {response.text}")
            return

        recipient_id = response.json().get("id")
        print(f"Recipient ID: {recipient_id}")

        print("\n--- TEST 1: Bind App via /servicePrincipals/{oid} ---")
        chat_url = "https://graph.microsoft.com/v1.0/chats"

        # Payload with 2 members
        chat_payload = {
            "chatType": "oneOnOne",
            "members": [
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "roles": ["owner"],
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users/{recipient_id}"
                },
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "roles": ["owner"],
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/servicePrincipals/{app_oid}"
                }
            ]
        }

        print(f"Payload: {json.dumps(chat_payload, indent=2)}")

        chat_response = requests.post(chat_url, headers=headers, json=chat_payload)
        print(f"Status: {chat_response.status_code}")
        print(f"Response: {chat_response.text}")

        if chat_response.status_code == 400:
            print("\n--- TEST 2: Bind App via /users/{oid} (Maybe it's treated as a user?) ---")
            chat_payload["members"][1]["user@odata.bind"] = f"https://graph.microsoft.com/v1.0/users/{app_oid}"

            chat_response = requests.post(chat_url, headers=headers, json=chat_payload)
            print(f"Status: {chat_response.status_code}")
            print(f"Response: {chat_response.text}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_teams_2member()
