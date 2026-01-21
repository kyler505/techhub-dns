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
        parts = token.split('.')
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
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

        claims = decode_jwt_payload(token)
        app_oid = claims.get("oid") if claims else None
        print(f"App Object ID (oid): {app_oid}")
        if not app_oid:
            return

        recipient_email = "kcao@tamu.edu"
        user_url = f"https://graph.microsoft.com/v1.0/users/{recipient_email}"
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.get(user_url, headers=headers)
        if resp.status_code != 200:
            print(f"User Lookup Failed: {resp.text}")
            return
        recipient_id = resp.json().get("id")
        print(f"Recipient ID: {recipient_id}")

        chat_url = "https://graph.microsoft.com/v1.0/chats"

        # TEST 1: Bind App via /servicePrincipals/{oid} (No roles)
        print("\n--- TEST 1: Bind App via /servicePrincipals/{oid} (No roles) ---")
        payload_1 = {
            "chatType": "oneOnOne",
            "members": [
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users/{recipient_id}"
                },
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/servicePrincipals/{app_oid}"
                }
            ]
        }
        res1 = requests.post(chat_url, headers=headers, json=payload_1)
        print(f"Status: {res1.status_code}")
        print(f"Response: {res1.text}")

        # TEST 2: Bind App via /users/{oid} (No roles)
        print("\n--- TEST 2: Bind App via /users/{oid} (No roles) ---")
        payload_2 = {
            "chatType": "oneOnOne",
            "members": [
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users/{recipient_id}"
                },
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users/{app_oid}"
                }
            ]
        }
        res2 = requests.post(chat_url, headers=headers, json=payload_2)
        print(f"Status: {res2.status_code}")
        print(f"Response: {res2.text}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_teams_2member()
