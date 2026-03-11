from pathlib import Path
import sys
from datetime import datetime, timedelta, timezone


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.session import Session
from app.models.user import User
from app.schemas.delivery_run import (
    _serialize_datetime_utc as serialize_delivery_run_datetime,
)
from app.schemas.order import _serialize_datetime_utc as serialize_order_datetime
from app.utils.timezone import ensure_utc_datetime, to_utc_iso_z


def test_ensure_utc_datetime_normalizes_naive_and_aware_values() -> None:
    naive = datetime(2026, 1, 15, 18, 0, 0)
    aware_central = datetime(
        2026, 1, 15, 12, 0, 0, tzinfo=timezone(timedelta(hours=-6))
    )

    normalized_naive = ensure_utc_datetime(naive)
    normalized_aware = ensure_utc_datetime(aware_central)

    assert normalized_naive.tzinfo == timezone.utc
    assert normalized_naive.isoformat() == "2026-01-15T18:00:00+00:00"
    assert normalized_aware.isoformat() == "2026-01-15T18:00:00+00:00"


def test_to_utc_iso_z_returns_explicit_utc_marker() -> None:
    naive = datetime(2026, 1, 15, 18, 0, 0)
    aware = datetime(2026, 7, 15, 13, 0, 0, tzinfo=timezone.utc)

    assert to_utc_iso_z(naive) == "2026-01-15T18:00:00Z"
    assert to_utc_iso_z(aware) == "2026-07-15T13:00:00Z"
    assert to_utc_iso_z(None) is None


def test_user_to_dict_serializes_timestamps_as_utc_z() -> None:
    user = User(
        tamu_oid="oid-123",
        email="tester@example.com",
        display_name="Test User",
        department="IT",
    )
    user.created_at = datetime(2026, 1, 15, 18, 0, 0)
    user.last_login_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

    payload = user.to_dict()

    assert payload["created_at"] == "2026-01-15T18:00:00Z"
    assert payload["last_login_at"] == "2026-01-15T12:00:00Z"


def test_session_to_dict_serializes_timestamps_as_utc_z() -> None:
    session = Session(user_id="user-123")
    session.created_at = datetime(2026, 1, 15, 18, 0, 0)
    session.expires_at = datetime(2026, 1, 16, 18, 0, 0, tzinfo=timezone.utc)
    session.last_seen_at = datetime(2026, 1, 15, 11, 30, 0, tzinfo=timezone.utc)

    payload = session.to_dict()

    assert payload["created_at"] == "2026-01-15T18:00:00Z"
    assert payload["expires_at"] == "2026-01-16T18:00:00Z"
    assert payload["last_seen_at"] == "2026-01-15T11:30:00Z"


def test_order_and_delivery_run_schema_serializers_emit_utc_z() -> None:
    naive = datetime(2026, 1, 15, 18, 0, 0)
    aware = datetime(2026, 7, 15, 13, 0, 0, tzinfo=timezone.utc)

    assert serialize_order_datetime(naive) == "2026-01-15T18:00:00Z"
    assert serialize_order_datetime(aware) == "2026-07-15T13:00:00Z"
    assert serialize_delivery_run_datetime(naive) == "2026-01-15T18:00:00Z"
    assert serialize_delivery_run_datetime(aware) == "2026-07-15T13:00:00Z"


if __name__ == "__main__":
    test_ensure_utc_datetime_normalizes_naive_and_aware_values()
    print("[PASS] ensure_utc_datetime normalizes naive and aware values")
    test_to_utc_iso_z_returns_explicit_utc_marker()
    print("[PASS] to_utc_iso_z emits UTC Z strings")
    test_user_to_dict_serializes_timestamps_as_utc_z()
    print("[PASS] User.to_dict emits UTC Z timestamps")
    test_session_to_dict_serializes_timestamps_as_utc_z()
    print("[PASS] Session.to_dict emits UTC Z timestamps")
    test_order_and_delivery_run_schema_serializers_emit_utc_z()
    print("[PASS] Schema serializers emit UTC Z timestamps")
    print("[SUCCESS] Timezone serialization regressions passed")
