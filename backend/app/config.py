import json
from typing import Optional, List, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    database_url: str

    # Inflow API
    inflow_api_url: str = "https://cloudapi.inflowinventory.com"
    inflow_company_id: str = "6eb6abe4-d92a-4130-a15e-64d3b7278b81"
    inflow_api_key: Optional[str] = None
    azure_key_vault_url: Optional[str] = None

    # Inflow Webhooks
    inflow_webhook_enabled: bool = False
    inflow_webhook_secret: Optional[str] = None
    inflow_webhook_url: Optional[str] = None
    inflow_webhook_events: List[str] = ["orderCreated", "orderUpdated"]
    inflow_webhook_auto_register: bool = False  # Auto-register webhook on app startup

    # Inflow Polling Sync (fallback when webhooks are enabled)
    inflow_polling_sync_enabled: bool = True
    inflow_polling_sync_interval_minutes: Optional[int] = None



    # Storage
    storage_root: str = "storage"
    picklist_template_path: str = "frontend/public/pdfs/sample.pdf"

    # SharePoint Storage
    sharepoint_enabled: bool = False  # Safety: disabled by default
    sharepoint_site_url: Optional[str] = None  # e.g., https://tamucs.sharepoint.com/teams/Team-TechHub
    sharepoint_folder_path: str = "General/delivery-storage"  # Folder within Documents library
    sharepoint_tenant_id: Optional[str] = None  # Azure AD tenant ID (e.g., from TAMU)
    sharepoint_client_id: Optional[str] = None  # Azure AD app client ID (register in Azure portal)


    # CORS
    frontend_url: str = "http://localhost:5173"

    # Auth (structure only)
    secret_key: str = "change-me-in-production"

    # TAMU SMTP Email Configuration
    smtp_enabled: bool = False  # Safety: disabled by default
    smtp_host: str = "relay.tamu.edu"
    smtp_port: int = 587
    smtp_username: Optional[str] = None  # shared_netid@tamu.edu
    smtp_password: Optional[str] = None
    smtp_from_address: Optional[str] = None  # e.g., techhub@tamu.edu
    email_from_name: str = "TechHub Technology Services"

    # Teams Recipient Notifications (Graph API)
    teams_recipient_notifications_enabled: bool = False




    # ===========================================
    # TAMU Entra ID Authentication (SAML + Service Principal)
    # ===========================================

    # SAML Configuration (User Authentication)
    saml_enabled: bool = False
    saml_idp_entity_id: Optional[str] = None  # From Azure: Microsoft Entra Identifier
    saml_idp_sso_url: Optional[str] = None  # From Azure: Login URL
    saml_idp_cert_path: Optional[str] = None  # Path to downloaded certificate file
    saml_sp_entity_id: str = "https://techhub.pythonanywhere.com"
    saml_acs_url: str = "https://techhub.pythonanywhere.com/auth/saml/callback"

    # Service Principal Configuration (Backend Graph API)
    azure_tenant_id: Optional[str] = None
    azure_client_id: Optional[str] = None  # Service Principal client ID
    azure_client_secret: Optional[str] = None  # Service Principal secret

    # Session Configuration
    session_cookie_name: str = "techhub_session"
    session_max_age_hours: int = 168  # 7 days

    # Flask environment
    flask_env: str = "development"

    # GitHub Deploy Webhook (auto-pull on push)
    deploy_webhook_enabled: bool = False
    deploy_webhook_secret: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"
    )

    @field_validator("inflow_webhook_events", mode="before")
    @classmethod
    def parse_inflow_webhook_events(cls, value: Any) -> List[str]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return parsed
                except json.JSONDecodeError:
                    pass
            return [item.strip() for item in raw.split(",") if item.strip()]
        return value


settings = Settings()
