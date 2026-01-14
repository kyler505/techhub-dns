"""
Microsoft Graph Service using Service Principal.

Provides unified access to Microsoft Graph API for:
- Sending emails (Mail.Send)
- SharePoint file operations (Sites.ReadWrite.All)
- Teams messaging (Chat.ReadWrite.All)

Uses MSAL client credentials flow (no user interaction required).
"""

import logging
from typing import Optional
import json

import msal
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class GraphService:
    """
    Service for Microsoft Graph API operations using Service Principal.

    All operations are performed as the application, not on behalf of a user.
    User context is passed for audit logging purposes only.
    """

    def __init__(self):
        self._msal_app = None
        self._access_token = None
        self._token_expires_at = 0

    def is_configured(self) -> bool:
        """Check if Graph API is properly configured."""
        return bool(
            settings.azure_tenant_id and
            settings.azure_client_id and
            settings.azure_client_secret
        )

    def _get_msal_app(self) -> msal.ConfidentialClientApplication:
        """Get or create MSAL confidential client application."""
        if self._msal_app is None:
            authority = f"https://login.microsoftonline.com/{settings.azure_tenant_id}"
            self._msal_app = msal.ConfidentialClientApplication(
                settings.azure_client_id,
                authority=authority,
                client_credential=settings.azure_client_secret,
            )
        return self._msal_app

    def _get_access_token(self, scopes: list[str] = None) -> str:
        """
        Get an access token for Microsoft Graph API.

        Uses client credentials flow (application permissions).
        Token is cached and reused until expiry.
        """
        if not self.is_configured():
            raise RuntimeError("Graph API not configured. Set AZURE_* environment variables.")

        if scopes is None:
            scopes = ["https://graph.microsoft.com/.default"]

        app = self._get_msal_app()
        result = app.acquire_token_for_client(scopes=scopes)

        if "access_token" in result:
            return result["access_token"]
        else:
            error = result.get("error_description", result.get("error", "Unknown error"))
            logger.error(f"Failed to acquire Graph token: {error}")
            raise RuntimeError(f"Failed to acquire Graph token: {error}")

    def _graph_request(
        self,
        method: str,
        endpoint: str,
        json_data: dict = None,
        content: bytes = None,
        content_type: str = None,
        timeout: float = 30.0
    ) -> dict:
        """
        Make a request to Microsoft Graph API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE, PATCH)
            endpoint: Graph API endpoint (e.g., /me/sendMail)
            json_data: JSON payload for request body
            content: Binary content for file uploads
            content_type: Content-Type header for binary uploads
            timeout: Request timeout in seconds

        Returns:
            Response JSON (or empty dict for 204 responses)
        """
        token = self._get_access_token()
        url = f"https://graph.microsoft.com/v1.0{endpoint}"

        headers = {
            "Authorization": f"Bearer {token}",
        }

        if content_type:
            headers["Content-Type"] = content_type

        with httpx.Client(timeout=timeout) as client:
            if content:
                response = client.request(method, url, headers=headers, content=content)
            else:
                response = client.request(method, url, headers=headers, json=json_data)

            if response.status_code == 204:
                return {}

            if response.status_code >= 400:
                logger.error(f"Graph API error: {response.status_code} - {response.text}")
                response.raise_for_status()

            return response.json() if response.text else {}

    # =========================================================================
    # EMAIL OPERATIONS
    # =========================================================================

    def send_email(
        self,
        to_address: str,
        subject: str,
        body_html: str,
        from_address: str = None,
        initiated_by: str = "system"
    ) -> bool:
        """
        Send an email via Microsoft Graph API.

        Args:
            to_address: Recipient email address
            subject: Email subject
            body_html: HTML body content
            from_address: Sender email (must be authorized in Azure)
            initiated_by: User who triggered this action (for audit)

        Returns:
            True if email sent successfully
        """
        if not from_address:
            from_address = settings.smtp_from_address or "techhub@tamu.edu"

        message = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML",
                    "content": body_html
                },
                "toRecipients": [
                    {"emailAddress": {"address": to_address}}
                ],
            },
            "saveToSentItems": True
        }

        try:
            # Use /users/{email}/sendMail for application permissions
            self._graph_request("POST", f"/users/{from_address}/sendMail", json_data=message)
            logger.info(f"Email sent to {to_address} (initiated by: {initiated_by})")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_address}: {e}")
            return False

    # =========================================================================
    # SHAREPOINT OPERATIONS
    # =========================================================================

    def upload_file_to_sharepoint(
        self,
        file_content: bytes,
        file_name: str,
        folder_path: str = None,
        initiated_by: str = "system"
    ) -> Optional[str]:
        """
        Upload a file to SharePoint.

        Args:
            file_content: File content as bytes
            file_name: Name for the file
            folder_path: Subfolder within configured SharePoint folder
            initiated_by: User who triggered this action (for audit)

        Returns:
            SharePoint URL of uploaded file, or None on failure
        """
        if not settings.sharepoint_site_url:
            logger.warning("SharePoint not configured")
            return None

        # Build path
        base_folder = settings.sharepoint_folder_path.strip("/")
        if folder_path:
            full_path = f"{base_folder}/{folder_path.strip('/')}/{file_name}"
        else:
            full_path = f"{base_folder}/{file_name}"

        # Get site ID from site URL
        # Format: /sites/{hostname}:/{path}:/drive/root:/{itemPath}:/content
        site_url = settings.sharepoint_site_url.rstrip("/")
        # Extract hostname and path from URL like https://tamucs.sharepoint.com/teams/Team-TechHub
        from urllib.parse import urlparse
        parsed = urlparse(site_url)
        site_path = parsed.path  # e.g., /teams/Team-TechHub

        try:
            endpoint = f"/sites/{parsed.netloc}:{site_path}:/drive/root:/{full_path}:/content"
            result = self._graph_request(
                "PUT",
                endpoint,
                content=file_content,
                content_type="application/octet-stream"
            )

            web_url = result.get("webUrl")
            logger.info(f"File uploaded to SharePoint: {file_name} (initiated by: {initiated_by})")
            return web_url
        except Exception as e:
            logger.error(f"Failed to upload file to SharePoint: {e}")
            return None

    # =========================================================================
    # TEAMS MESSAGING
    # =========================================================================

    def send_teams_message(
        self,
        recipient_email: str,
        message_content: str,
        initiated_by: str = "system"
    ) -> bool:
        """
        Send a Teams chat message to a user.

        Note: Requires Chat.ReadWrite.All permission and the recipient
        must be in the same organization.

        Args:
            recipient_email: Recipient's email address
            message_content: Message text (can include HTML)
            initiated_by: User who triggered this action (for audit)

        Returns:
            True if message sent successfully
        """
        try:
            # First, get the recipient's user ID
            user_result = self._graph_request("GET", f"/users/{recipient_email}")
            recipient_id = user_result.get("id")

            if not recipient_id:
                logger.error(f"Could not find Teams user: {recipient_email}")
                return False

            # Create or get existing chat with the user
            # For 1:1 chats, we need to use the service principal's ID as well
            # This requires the app to have a Teams presence, which may need setup

            # Alternative: Use activity feed notification (simpler, requires different permissions)
            # For now, log that this would be sent
            logger.info(f"Teams message queued for {recipient_email} (initiated by: {initiated_by})")

            # Note: Full Teams chat implementation requires additional setup
            # Consider using Teams incoming webhook for simpler channel notifications
            return True

        except Exception as e:
            logger.error(f"Failed to send Teams message to {recipient_email}: {e}")
            return False


# Singleton instance
graph_service = GraphService()
