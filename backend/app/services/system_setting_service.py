from sqlalchemy.orm import Session
from typing import Optional, Dict, Any

from app.database import get_db_session
from app.models.system_setting import SystemSetting

SETTING_EMAIL_ENABLED = "email_notifications_enabled"
SETTING_TEAMS_RECIPIENT_ENABLED = "teams_recipient_notifications_enabled"

DEFAULT_SETTINGS = {
    SETTING_EMAIL_ENABLED: {"value": "true", "description": "Enable sending email notifications (Order Details PDFs)"},
    SETTING_TEAMS_RECIPIENT_ENABLED: {"value": "false", "description": "Enable sending delivery notifications to recipients via Teams"},
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
            if setting:
                return setting.value
            return DEFAULT_SETTINGS.get(key, {}).get("value", "false")
        finally:
            if should_close:
                db.close()

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
