import httpx
import logging
import json
from datetime import datetime
from typing import Optional, Dict, Any, List, cast
from app.config import settings

logger = logging.getLogger(__name__)

class TagRequestService:
    def __init__(self):
        self.webdav_base_url = settings.tag_request_webdav_base_url
        self.webdav_target_path = settings.tag_request_webdav_target_path
        self.webdav_username = settings.tag_request_webdav_username
        self.teams_workflow_url = settings.tag_request_teams_workflow_url
        self.teams_shared_secret = settings.tag_request_teams_shared_secret
        self._webdav_password: Optional[str] = None

    @property
    def webdav_password(self) -> str:
        """Lazy password retrieval from Key Vault."""
        if self._webdav_password is None:
            self._webdav_password = self._get_webdav_password()
        return self._webdav_password

    def _get_webdav_password(self) -> str:
        """Fetch WebDAV password from Azure Key Vault."""
        vault_url = settings.azure_key_vault_url
        if vault_url:
            tenant_id = settings.azure_tenant_id
            client_id = settings.azure_client_id
            client_secret = settings.azure_client_secret

            if not all([tenant_id, client_id, client_secret]):
                raise ValueError(
                    "Azure Key Vault configured but Service Principal credentials missing. "
                    "Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
                )

            tenant_id = cast(str, tenant_id)
            client_id = cast(str, client_id)
            client_secret = cast(str, client_secret)

            try:
                from azure.identity import ClientSecretCredential
                from azure.keyvault.secrets import SecretClient

                credential = ClientSecretCredential(
                    tenant_id=tenant_id,
                    client_id=client_id,
                    client_secret=client_secret,
                )
                kv_client = SecretClient(vault_url=vault_url, credential=credential)
                secret = kv_client.get_secret(settings.tag_request_webdav_password_secret_name)
                logger.info("Retrieved WebDAV password from Azure Key Vault")
                if not secret.value:
                    raise ValueError("Key Vault returned empty WebDAV password")
                return secret.value
            except Exception as e:
                raise ValueError(f"Failed to get WebDAV password from Key Vault: {e}")

        raise ValueError("AZURE_KEY_VAULT_URL must be set to retrieve WebDAV password")

    async def upload_json_to_webdav(self, filename: str, payload: Dict[str, Any]) -> bool:
        """Upload JSON payload to WebDAV server."""
        if not self.webdav_base_url:
            logger.error("WebDAV base URL not configured")
            return False

        url = f"{self.webdav_base_url.rstrip('/')}/{self.webdav_target_path.lstrip('/')}/{filename}"
        
        async with httpx.AsyncClient() as client:
            try:
                request_headers = {"Content-Type": "application/json"}
                if self.webdav_username:
                    auth = httpx.BasicAuth(self.webdav_username, self.webdav_password)
                    response = await client.put(
                        url,
                        content=json.dumps(payload, indent=2),
                        auth=auth,
                        headers=request_headers,
                    )
                else:
                    response = await client.put(
                        url,
                        content=json.dumps(payload, indent=2),
                        headers=request_headers,
                    )
                response.raise_for_status()
                logger.info(f"Successfully uploaded {filename} to WebDAV")
                return True
            except Exception as e:
                logger.error(f"Failed to upload to WebDAV: {e}")
                return False

    async def send_teams_notification(self, order_number: str, filename: str, technician: str) -> bool:
        """Send notification to Teams via Workflow webhook."""
        if not self.teams_workflow_url:
            logger.info("Teams workflow URL not configured; skipping notification")
            return True

        # Adaptive Card payload
        payload = {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "type": "AdaptiveCard",
                        "body": [
                            {
                                "type": "TextBlock",
                                "size": "Medium",
                                "weight": "Bolder",
                                "text": "New Tag Request"
                            },
                            {
                                "type": "FactSet",
                                "facts": [
                                    {"title": "Order Number:", "value": order_number},
                                    {"title": "Technician:", "value": technician},
                                    {"title": "Filename:", "value": filename},
                                    {"title": "Requested At:", "value": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")}
                                ]
                            }
                        ],
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "version": "1.4"
                    }
                }
            ]
        }

        headers = {"Content-Type": "application/json"}
        if self.teams_shared_secret:
            headers["X-Teams-Shared-Secret"] = self.teams_shared_secret

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.teams_workflow_url, json=payload, headers=headers)
                response.raise_for_status()
                logger.info(f"Teams notification sent for order {order_number}")
                return True
            except Exception as e:
                logger.error(f"Failed to send Teams notification: {e}")
                return False

    async def process_tag_request(
        self, 
        order_number: str, 
        technician: str, 
        serials_payload: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Orchestrate WebDAV upload and Teams notification."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"tag_request_{order_number}_{timestamp}.json"
        
        payload = {
            "order_number": order_number,
            "requested_by": technician,
            "requested_at": datetime.utcnow().isoformat(),
            "items": serials_payload
        }

        webdav_success = await self.upload_json_to_webdav(filename, payload)
        
        if webdav_success:
            await self.send_teams_notification(order_number, filename, technician)
            return {
                "status": "success",
                "filename": filename,
                "sent_at": payload["requested_at"]
            }
        
        return {
            "status": "error",
            "message": "Failed to upload tag request to WebDAV"
        }
