import sys
import os
import logging
import requests
from urllib.parse import urlparse

# Add backend to path
sys.path.insert(0, os.getcwd())

from app.config import settings
from app.services.graph_service import graph_service

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

def verify_sharepoint():
    print("--- 1. Authenticate ---")
    try:
        token = graph_service._get_access_token()
        print("Token acquired.")
    except Exception as e:
        print(f"Auth Failed: {e}")
        return

    headers = {"Authorization": f"Bearer {token}"}

    print("\n--- 2. Get Site ---")
    site_url = settings.sharepoint_site_url
    print(f"Config Site URL: {site_url}")
    parsed = urlparse(site_url)
    hostname = parsed.netloc
    site_path = parsed.path

    # Construct Site ID request
    endpoint = f"https://graph.microsoft.com/v1.0/sites/{hostname}:{site_path}"
    print(f"GET {endpoint}")
    resp = requests.get(endpoint, headers=headers)

    if resp.status_code != 200:
        print(f"Error: {resp.text}")
        return

    site_data = resp.json()
    site_id = site_data.get('id')
    print(f"Site ID: {site_id}")

    print("\n--- 3. List All Drives ---")
    drives_endpoint = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
    print(f"GET {drives_endpoint}")
    resp = requests.get(drives_endpoint, headers=headers)

    if resp.status_code != 200:
        print(f"Error listing drives: {resp.text}")
        return

    drives_data = resp.json()
    drives = drives_data.get('value', [])
    print(f"Found {len(drives)} drives:")

    target_drive_id = None

    for d in drives:
        d_name = d.get('name')
        d_id = d.get('id')
        print(f" - Name: {d_name} | ID: {d_id}")

        # Look for the standard "Documents" library
        if d_name == "Documents":
            target_drive_id = d_id

    if not target_drive_id and drives:
        target_drive_id = drives[0].get('id')
        print(f"WARNING: 'Documents' library not explicitly found. Defaulting to first drive: {drives[0].get('name')}")

    if target_drive_id:
        drive_id = target_drive_id
        print(f"\nUsing Target Drive ID: {drive_id}")
    else:
        print("No drives found!")
        return

    print("\n--- 4. Verify Folder Path Segments ---")
    full_path = f"{settings.sharepoint_folder_path}/{settings.teams_notification_queue_folder}"
    # Normalize separators
    full_path = full_path.replace("\\", "/")
    while "//" in full_path:
        full_path = full_path.replace("//", "/")

    segments = full_path.split("/")

    current_path = ""
    for segment in segments:
        if not segment: continue

        if current_path:
            current_path = f"{current_path}/{segment}"
        else:
            current_path = segment

        print(f"Checking: {current_path}")
        folder_endpoint = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{current_path}"
        resp = requests.get(folder_endpoint, headers=headers)
        if resp.status_code == 200:
            print(f"  [OK] Found: {current_path}")
        else:
            print(f"  [MISSING] Not Found: {current_path}")
            print(f"  Error: {resp.text}")
            break

    # Step 5: Try Upload
    print("\n--- 5. Test File Upload (via Drive ID) ---")
    file_path = f"{full_path}/test_upload.txt"
    print(f"Uploading to: {file_path}")

    # Correct endpoint using Drive ID
    upload_endpoint = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{file_path}:/content"

    resp = requests.put(upload_endpoint, data="Validation Test", headers={"Authorization": f"Bearer {token}", "Content-Type": "text/plain"})

    print(f"Upload Status: {resp.status_code}")
    if resp.status_code in [200, 201]:
        print("SUCCESS: File uploaded via Drive ID.")
    else:
        print(f"FAILURE: {resp.text}")

if __name__ == "__main__":
    verify_sharepoint()
