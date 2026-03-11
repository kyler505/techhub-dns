from datetime import datetime, timezone, timedelta


def ensure_utc_datetime(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_utc_iso_z(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return ensure_utc_datetime(dt).isoformat().replace("+00:00", "Z")


def get_cst_datetime(dt: datetime) -> datetime:
    """Convert a datetime to Central Standard Time (CST, UTC-6)."""
    cst_offset = timedelta(hours=-6)
    cst_tz = timezone(cst_offset)
    return dt.astimezone(cst_tz)


def is_morning_in_cst(dt: datetime) -> bool:
    """Check if a datetime is before 12 PM CST."""
    cst_time = get_cst_datetime(dt)
    return cst_time.hour < 12


def get_date_in_cst(dt: datetime) -> str:
    """Get the date string in CST (YYYY-MM-DD format)."""
    cst_time = get_cst_datetime(dt)
    return cst_time.strftime("%Y-%m-%d")
