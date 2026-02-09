from sqlalchemy.orm import Session
from typing import Optional, Dict, Any

from app.database import get_db_session
from app.models.system_setting import SystemSetting

# Notification Toggles
SETTING_EMAIL_ENABLED = "email_notifications_enabled"
SETTING_TEAMS_RECIPIENT_ENABLED = "teams_recipient_notifications_enabled"

# Admin allowlist
SETTING_ADMIN_EMAILS = "admin_emails"

DEFAULT_SETTINGS = {
    SETTING_EMAIL_ENABLED: {"value": "true", "description": "Enable sending email notifications (Order Details PDFs)"},
    SETTING_TEAMS_RECIPIENT_ENABLED: {"value": "false", "description": "Enable sending delivery notifications to recipients via Teams"},
    SETTING_ADMIN_EMAILS: {"value": "[]", "description": "Admin email allowlist (JSON array string preferred; CSV accepted)"},
}

class SystemSettingService:
    @staticmethod
    def get_setting(db: Session, key: str) -> str:
        """Get a setting value from DB, or default if not set."""
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            return setting.value
        return DEFAULT_SETTINGS.get(key, {}).get("value", "false")

    @staticmethod
    def set_setting(key: str, value: str, updated_by: str = None) -> SystemSetting:
        """Set a setting value in the DB."""
        db = get_db_session()
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
            db.close()

    @staticmethod
    def is_setting_enabled(key: str) -> bool:
        """Check if a boolean setting is enabled."""
        db = get_db_session()
        try:
            value = SystemSettingService.get_setting(db, key)
            return value.lower() in ("true", "1", "yes", "on")
        finally:
            db.close()

    @staticmethod
    def get_all_settings() -> dict:
        """Get all settings with their metadata."""
        db = get_db_session()
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
            db.close()
