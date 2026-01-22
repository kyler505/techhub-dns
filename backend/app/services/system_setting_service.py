from sqlalchemy.orm import Session
from typing import Optional, Dict, Any

from app.database import get_db_session
from app.models.system_setting import SystemSetting

from app.config import settings

# Notification Toggles
SETTING_EMAIL_ENABLED = "email_notifications_enabled"
SETTING_TEAMS_RECIPIENT_ENABLED = "teams_recipient_notifications_enabled"
SETTING_SHAREPOINT_ENABLED = "sharepoint_enabled"

# Azure / Graph API Configuration
SETTING_AZURE_TENANT_ID = "azure_tenant_id"
SETTING_AZURE_CLIENT_ID = "azure_client_id"
SETTING_AZURE_CLIENT_SECRET = "azure_client_secret"

# Email Configuration
SETTING_EMAIL_FROM_ADDRESS = "email_from_address"
SETTING_EMAIL_FROM_NAME = "email_from_name"

# SharePoint Configuration
SETTING_SHAREPOINT_SITE_URL = "sharepoint_site_url"
SETTING_SHAREPOINT_FOLDER_PATH = "sharepoint_folder_path"
SETTING_TEAMS_NOTIFICATION_QUEUE_FOLDER = "teams_notification_queue_folder"

# Inflow Configuration
SETTING_INFLOW_API_URL = "inflow_api_url"
SETTING_INFLOW_COMPANY_ID = "inflow_company_id"
SETTING_INFLOW_API_KEY = "inflow_api_key"
SETTING_INFLOW_WEBHOOK_SECRET = "inflow_webhook_secret"

DEFAULT_SETTINGS = {
    # Toggles
    SETTING_EMAIL_ENABLED: {"value": "true", "description": "Enable sending email notifications (Order Details PDFs)"},
    SETTING_TEAMS_RECIPIENT_ENABLED: {"value": "false", "description": "Enable sending delivery notifications to recipients via Teams"},
    SETTING_SHAREPOINT_ENABLED: {"value": "true", "description": "Enable uploading PDFs and data to SharePoint"},

    # Azure
    SETTING_AZURE_TENANT_ID: {"value": "", "description": "Microsoft Entra (Azure) Tenant ID"},
    SETTING_AZURE_CLIENT_ID: {"value": "", "description": "Microsoft Entra (Azure) Client ID"},
    SETTING_AZURE_CLIENT_SECRET: {"value": "", "description": "Microsoft Entra (Azure) Client Secret"},

    # Email
    SETTING_EMAIL_FROM_ADDRESS: {"value": "techhub@tamu.edu", "description": "Sender email address for notifications"},
    SETTING_EMAIL_FROM_NAME: {"value": "TechHub Orders", "description": "Sender display name for notifications"},

    # SharePoint
    SETTING_SHAREPOINT_SITE_URL: {"value": "", "description": "SharePoint Site URL (https://tenant.sharepoint.com/sites/site)"},
    SETTING_SHAREPOINT_FOLDER_PATH: {"value": "Shared Documents/TechHub", "description": "Base folder path in SharePoint"},
    SETTING_TEAMS_NOTIFICATION_QUEUE_FOLDER: {"value": "TeamsQueue", "description": "Folder name for Teams notification queue"},

    # Inflow
    SETTING_INFLOW_API_URL: {"value": "https://api.inflowinventory.com", "description": "Inflow API Base URL"},
    SETTING_INFLOW_COMPANY_ID: {"value": "", "description": "Inflow Company ID"},
    SETTING_INFLOW_API_KEY: {"value": "", "description": "Inflow API V2 Key"},
    SETTING_INFLOW_WEBHOOK_SECRET: {"value": "", "description": "Secret key for verifying Inflow webhooks"},
}

class SystemSettingService:
    @staticmethod
    def get_setting(key: str, db: Optional[Session] = None) -> str:
        """Get a setting value from DB, or default if not set."""
        should_close = False
        if db is None:
            db = get_db_session()
            should_close = True

        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if setting and setting.value:
                return setting.value
            return DEFAULT_SETTINGS.get(key, {}).get("value", "")
        finally:
            if should_close:
                db.close()

    @staticmethod
    def get_value(key: str, db: Optional[Session] = None) -> str:
        """
        Get a value from SystemSettings (DB), falling back to environment variables (settings).
        This is the preferred way to access configuration that can be overriden in the UI.
        """
        # 1. Check DB
        db_val = SystemSettingService.get_setting(key, db)
        if db_val:
            return db_val

        # 2. Check settings (env vars) via mapping
        env_mapping = {
            SETTING_AZURE_TENANT_ID: "azure_tenant_id",
            SETTING_AZURE_CLIENT_ID: "azure_client_id",
            SETTING_AZURE_CLIENT_SECRET: "azure_client_secret",
            SETTING_EMAIL_FROM_ADDRESS: "smtp_from_address",
            SETTING_EMAIL_FROM_NAME: "email_from_name",
            SETTING_SHAREPOINT_SITE_URL: "sharepoint_site_url",
            SETTING_SHAREPOINT_FOLDER_PATH: "sharepoint_folder_path",
            SETTING_TEAMS_NOTIFICATION_QUEUE_FOLDER: "teams_notification_queue_folder",
            SETTING_INFLOW_API_URL: "inflow_api_url",
            SETTING_INFLOW_COMPANY_ID: "inflow_company_id",
            SETTING_INFLOW_API_KEY: "inflow_api_key",
            SETTING_INFLOW_WEBHOOK_SECRET: "inflow_webhook_secret",
            SETTING_SHAREPOINT_ENABLED: "sharepoint_enabled",
        }

        env_key = env_mapping.get(key)
        if env_key and hasattr(settings, env_key):
            val = getattr(settings, env_key)
            if val is not None:
                return str(val)

        return DEFAULT_SETTINGS.get(key, {}).get("value", "")

    @staticmethod
    def set_setting(key: str, value: str, updated_by: str = None, db: Optional[Session] = None) -> SystemSetting:
        """Set a setting value in the DB."""
        should_close = False
        if db is None:
            db = get_db_session()
            should_close = True

        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if not setting:
                setting = SystemSetting(
                    key=key,
                    value=value,
                    description=DEFAULT_SETTINGS.get(key, {}).get("description"),
                    updated_by=updated_by
                )
                db.add(setting)
            else:
                setting.value = value
                setting.updated_by = updated_by
            db.commit()
            db.refresh(setting)
            return setting
        finally:
            if should_close:
                db.close()

    @staticmethod
    def is_setting_enabled(key: str, db: Optional[Session] = None) -> bool:
        """Check if a boolean setting is enabled."""
        value = SystemSettingService.get_setting(key, db)
        return value.lower() in ("true", "1", "yes", "on")

    @staticmethod
    def get_all_settings(db: Optional[Session] = None) -> Dict[str, Any]:
        """Get all known settings."""
        should_close = False
        if db is None:
            db = get_db_session()
            should_close = True

        try:
            result = {}
            for key, defaults in DEFAULT_SETTINGS.items():
                setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
                result[key] = {
                    "value": setting.value if setting else defaults["value"],
                    "description": defaults["description"],
                    "updated_at": setting.updated_at.isoformat() if setting and setting.updated_at else None,
                    "updated_by": setting.updated_by if setting else None,
                }
            return result
        finally:
            if should_close:
                db.close()
