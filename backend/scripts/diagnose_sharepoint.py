import os
import sys
import json
import logging
import requests
from urllib.parse import urlparse

# Setup path and logging
sys.path.insert(0, os.getcwd())
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.config import settings
from app.services.graph_service import graph_service

def diagnose_sharepoint():
    print("Starting SharePoint Diagnosis...")

    if not settings.sharepoint_site_url:
        print("✗ Error: SHAREPOINT_SITE_URL not set")
        return

    try:
        token = graph_service._get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # 1. Get Site ID
        site_url = settings.sharepoint_site_url
        parsed = urlparse(site_url)
        hostname = parsed.netloc
        site_path = parsed.path

        site_endpoint = f"https://graph.microsoft.com/v1.0/sites/{hostname}:{site_path}"
        print(f"Resolving Site: {site_endpoint}")
        site_resp = requests.get(site_endpoint, headers=headers)
        if site_resp.status_code != 200:
            print(f"✗ Failed to get site: {site_resp.status_code} - {site_resp.text}")
            return
        site_id = site_resp.json().get('id')
        print(f"✓ Site ID: {site_id}")

        # 2. Get Drive ID
        drives_endpoint = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
        drives_resp = requests.get(drives_endpoint, headers=headers)
        if drives_resp.status_code != 200:
            print(f"✗ Failed to list drives: {drives_resp.status_code} - {drives_resp.text}")
            return

        drives = drives_resp.json().get('value', [])
        drive_id = None
        for d in drives:
            print(f"  Found Drive: {d.get('name')} ({d.get('id')})")
            if d.get('name') == "Documents":
                drive_id = d.get('id')

        if not drive_id:
            print("! Documents drive not found by name, listing items in root to investigate...")
            drive_id = drives[0].get('id') if drives else None

        if not drive_id:
            print("✗ No drives found")
            return

        print(f"✓ Using Drive ID: {drive_id}")

        # 3. Test Path
        base_folder = settings.sharepoint_folder_path.strip("/")
        test_filename = "test_diag.json"
        full_path = f"{base_folder}/{test_filename}"
        full_path = full_path.replace("\\", "/").replace("//", "/")

        endpoint = f"/drives/{drive_id}/root:/{full_path}:/content"
        url = f"https://graph.microsoft.com/v1.0{endpoint}"
        print(f"Testing Upload to: {url}")

        test_content = b'{"status": "diagnostic test"}'
        headers_put = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream"
        }

        put_resp = requests.put(url, headers=headers_put, data=test_content)
        if put_resp.status_code >= 400:
            print(f"✗ Upload FAILED: {put_resp.status_code}")
            print(f"  Response: {put_resp.text}")
        else:
            print(f"✓ Upload SUCCESS: {put_resp.status_code}")
            print(f"  Web URL: {put_resp.json().get('webUrl')}")

    except Exception as e:
        print(f"✗ Exception during diagnosis: {e}")

if __name__ == "__main__":
    diagnose_sharepoint()
