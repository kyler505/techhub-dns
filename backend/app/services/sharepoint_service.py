"""
SharePoint Storage Service for file and QA data storage.
Uses Microsoft Graph API with Interactive Browser authentication.
"""

import io
import json
import logging
from typing import Optional, Dict, Any
from functools import lru_cache

import httpx
from azure.identity import InteractiveBrowserCredential

from app.config import settings

logger = logging.getLogger(__name__)

# Microsoft Graph API scopes for SharePoint access
GRAPH_SCOPES = ["https://graph.microsoft.com/.default"]
GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"


class SharePointService:
    """Service for uploading and managing files in SharePoint via Microsoft Graph API."""

    def __init__(self):
        self._credential: Optional[InteractiveBrowserCredential] = None
        self._access_token: Optional[str] = None
        self._site_id: Optional[str] = None
        self._drive_id: Optional[str] = None

    @property
    def is_enabled(self) -> bool:
        """Check if SharePoint storage is enabled and configured."""
        return settings.sharepoint_enabled and bool(settings.sharepoint_site_url)

    def _get_credential(self) -> InteractiveBrowserCredential:
        """Get or create the interactive browser credential."""
        if self._credential is None:
            logger.info("Initializing SharePoint authentication (browser window will open)...")
            self._credential = InteractiveBrowserCredential()
        return self._credential

    def _get_access_token(self) -> str:
        """Get access token for Microsoft Graph API."""
        credential = self._get_credential()
        # Request token with Graph API scope
        token = credential.get_token("https://graph.microsoft.com/.default")
        return token.token

    def _get_headers(self) -> Dict[str, str]:
        """Get authorization headers for Graph API requests."""
        token = self._get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    def _get_site_id(self) -> str:
        """Get SharePoint site ID from the configured URL."""
        if self._site_id:
            return self._site_id

        # Parse site URL: https://tamucs.sharepoint.com/teams/Team-TechHub
        site_url = settings.sharepoint_site_url.rstrip("/")

        # Extract host and site path
        # URL format: https://{host}/sites/{sitename} or https://{host}/teams/{teamname}
        if "/teams/" in site_url:
            parts = site_url.split("/teams/")
            host = parts[0].replace("https://", "").replace("http://", "")
            site_path = f"teams/{parts[1]}"
        elif "/sites/" in site_url:
            parts = site_url.split("/sites/")
            host = parts[0].replace("https://", "").replace("http://", "")
            site_path = f"sites/{parts[1]}"
        else:
            raise ValueError(f"Invalid SharePoint URL format: {site_url}")

        # Get site ID via Graph API
        url = f"{GRAPH_BASE_URL}/sites/{host}:/{site_path}"

        with httpx.Client() as client:
            response = client.get(url, headers=self._get_headers())
            response.raise_for_status()
            data = response.json()
            self._site_id = data["id"]
            logger.info(f"Retrieved SharePoint site ID: {self._site_id}")
            return self._site_id

    def _get_drive_id(self) -> str:
        """Get the default document library (drive) ID."""
        if self._drive_id:
            return self._drive_id

        site_id = self._get_site_id()
        url = f"{GRAPH_BASE_URL}/sites/{site_id}/drive"

        with httpx.Client() as client:
            response = client.get(url, headers=self._get_headers())
            response.raise_for_status()
            data = response.json()
            self._drive_id = data["id"]
            logger.info(f"Retrieved SharePoint drive ID: {self._drive_id}")
            return self._drive_id

    def _get_folder_path(self, subfolder: str) -> str:
        """Build the full folder path within the document library."""
        base_path = settings.sharepoint_folder_path.strip("/")
        subfolder = subfolder.strip("/")
        return f"{base_path}/{subfolder}" if subfolder else base_path

    def upload_file(
        self,
        content: bytes,
        subfolder: str,
        filename: str
    ) -> str:
        """
        Upload a file to SharePoint.

        Args:
            content: File content as bytes
            subfolder: Subfolder within the base folder (e.g., "qa", "picklists")
            filename: Name of the file

        Returns:
            Web URL to the uploaded file
        """
        if not self.is_enabled:
            raise RuntimeError("SharePoint storage is not enabled")

        drive_id = self._get_drive_id()
        folder_path = self._get_folder_path(subfolder)

        # Build upload URL
        # For files < 4MB, use simple PUT
        # For larger files, would need resumable upload (not implemented)
        upload_url = f"{GRAPH_BASE_URL}/drives/{drive_id}/root:/{folder_path}/{filename}:/content"

        headers = self._get_headers()
        headers["Content-Type"] = "application/octet-stream"

        logger.info(f"Uploading file to SharePoint: {folder_path}/{filename}")

        with httpx.Client(timeout=60.0) as client:
            response = client.put(upload_url, headers=headers, content=content)
            response.raise_for_status()
            data = response.json()

            web_url = data.get("webUrl", "")
            logger.info(f"File uploaded successfully: {web_url}")
            return web_url

    def upload_json(
        self,
        data: Dict[str, Any],
        subfolder: str,
        filename: str
    ) -> str:
        """
        Upload JSON data as a file to SharePoint.

        Args:
            data: Dictionary to serialize as JSON
            subfolder: Subfolder within the base folder
            filename: Name of the file (should end with .json)

        Returns:
            Web URL to the uploaded file
        """
        json_content = json.dumps(data, indent=2, sort_keys=True).encode("utf-8")
        return self.upload_file(json_content, subfolder, filename)

    def upload_pdf(
        self,
        pdf_path: str,
        subfolder: str,
        filename: Optional[str] = None
    ) -> str:
        """
        Upload a PDF file from disk to SharePoint.

        Args:
            pdf_path: Path to the PDF file on disk
            subfolder: Subfolder within the base folder
            filename: Optional filename (uses original if not provided)

        Returns:
            Web URL to the uploaded file
        """
        from pathlib import Path

        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        if filename is None:
            filename = path.name

        content = path.read_bytes()
        return self.upload_file(content, subfolder, filename)

    def get_file_url(self, subfolder: str, filename: str) -> Optional[str]:
        """
        Get the web URL for a file in SharePoint.

        Returns None if the file doesn't exist.
        """
        if not self.is_enabled:
            return None

        try:
            drive_id = self._get_drive_id()
            folder_path = self._get_folder_path(subfolder)
            url = f"{GRAPH_BASE_URL}/drives/{drive_id}/root:/{folder_path}/{filename}"

            with httpx.Client() as client:
                response = client.get(url, headers=self._get_headers())
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                data = response.json()
                return data.get("webUrl")
        except Exception as e:
            logger.error(f"Error getting file URL: {e}")
            return None


# Singleton instance (lazy initialization)
_sharepoint_service: Optional[SharePointService] = None


def get_sharepoint_service() -> SharePointService:
    """Get the SharePoint service singleton."""
    global _sharepoint_service
    if _sharepoint_service is None:
        _sharepoint_service = SharePointService()
    return _sharepoint_service
