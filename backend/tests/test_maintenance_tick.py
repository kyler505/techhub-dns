#!/usr/bin/env python3

import os
import sys
from datetime import datetime, timedelta, timezone


def _assert(condition: bool, message: str) -> None:
    if condition:
        return
    raise AssertionError(message)


def _upsert_setting(db, key: str, value: str) -> None:
    from app.models.system_setting import SystemSetting

    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row is None:
        row = SystemSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()


def _get_setting(db, key: str):
    from app.models.system_setting import SystemSetting

    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row is None:
        return None
    value = getattr(row, "value", None)
    if value is None:
        return None
    return str(value)


def main() -> None:
    # Force an isolated in-memory DB so these tests never touch real data.
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"

    # Small, deterministic limits for bounded work.
    os.environ["MAINTENANCE_TICK_ENABLED"] = "true"
    os.environ["MAINTENANCE_SESSIONS_PURGE_INTERVAL_HOURS"] = "24"
    os.environ["MAINTENANCE_SESSIONS_PURGE_BATCH_SIZE"] = "5"
    os.environ["MAINTENANCE_AUDIT_ARCHIVE_INTERVAL_HOURS"] = "24"
    os.environ["MAINTENANCE_AUDIT_ARCHIVE_MAX_BATCHES_PER_TICK"] = "2"

    os.environ["SYSTEM_AUDIT_ARCHIVE_BATCH_SIZE"] = "3"
    os.environ["SYSTEM_AUDIT_ARCHIVE_DAYS"] = "90"

    # Ensure backend/ is on sys.path when running as a script.
    sys.path.append(".")

    from app.database import Base, SessionLocal, engine
    from app.models.audit_log import SystemAuditLog, SystemAuditLogArchive
    from app.models.session import Session
    from app.models.user import User
    from app.services.maintenance_tick_service import run_maintenance_tick

    Base.metadata.create_all(bind=engine)

    tick0 = datetime(2026, 2, 11, 12, 0, 0, tzinfo=timezone.utc)
    due_last_success = (tick0 - timedelta(days=2)).replace(microsecond=0).isoformat()
    not_due_last_success = tick0.replace(microsecond=0).isoformat()

    db = SessionLocal()
    try:
        user = User(
            tamu_oid="test-oid",
            email="test@example.com",
            display_name="Test User",
            created_at=tick0.replace(tzinfo=None),
            last_login_at=tick0.replace(tzinfo=None),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Sessions: 12 expired + 1 active.
        expired_at = (tick0 - timedelta(hours=1)).replace(tzinfo=None)
        active_expires_at = (tick0 + timedelta(days=1)).replace(tzinfo=None)

        expired_sessions = [
            Session(
                user_id=user.id,
                created_at=expired_at,
                last_seen_at=expired_at,
                expires_at=expired_at,
                revoked_at=None,
            )
            for _ in range(12)
        ]
        active = Session(
            user_id=user.id,
            created_at=tick0.replace(tzinfo=None),
            last_seen_at=tick0.replace(tzinfo=None),
            expires_at=active_expires_at,
            revoked_at=None,
        )
        db.add_all(expired_sessions + [active])
        db.commit()

        # Audit logs: 10 old + 1 recent.
        old_ts = (tick0 - timedelta(days=120)).replace(tzinfo=None)
        recent_ts = (tick0 - timedelta(days=10)).replace(tzinfo=None)
        old_logs = [
            SystemAuditLog(
                entity_type="system",
                entity_id="system",
                action=f"old-{i}",
                description="old row",
                timestamp=old_ts,
                created_at=old_ts,
            )
            for i in range(10)
        ]
        recent_log = SystemAuditLog(
            entity_type="system",
            entity_id="system",
            action="recent",
            description="recent row",
            timestamp=recent_ts,
            created_at=recent_ts,
        )
        db.add_all(old_logs + [recent_log])
        db.commit()

        # Not due: should not do any work.
        _upsert_setting(db, "__maintenance.jobs.purge_sessions.pending", "false")
        _upsert_setting(db, "__maintenance.jobs.purge_sessions.last_success", not_due_last_success)
        _upsert_setting(db, "__maintenance.jobs.archive_system_audit_logs.pending", "false")
        _upsert_setting(db, "__maintenance.jobs.archive_system_audit_logs.last_success", not_due_last_success)

        result = run_maintenance_tick(db, now=tick0)
        _assert(result.sessions.ran is False, "Expected sessions job not to run when not due")
        _assert(result.audit.ran is False, "Expected audit job not to run when not due")

        _assert(db.query(Session).count() == 13, "Expected no session changes when not due")
        _assert(db.query(SystemAuditLog).count() == 11, "Expected no audit changes when not due")
        _assert(db.query(SystemAuditLogArchive).count() == 0, "Expected no audit archive rows when not due")

        # Due: bounded progress.
        _upsert_setting(db, "__maintenance.jobs.purge_sessions.last_success", due_last_success)
        _upsert_setting(db, "__maintenance.jobs.archive_system_audit_logs.last_success", due_last_success)

        tick1 = tick0 + timedelta(seconds=1)
        result1 = run_maintenance_tick(db, now=tick1)
        _assert(result1.sessions.ran is True, "Expected sessions job to run when due")
        _assert(result1.sessions.processed == 5, f"Expected 5 sessions purged, got {result1.sessions.processed}")
        _assert(result1.sessions.pending is True, "Expected sessions job to be pending after first batch")

        _assert(result1.audit.ran is True, "Expected audit job to run when due")
        _assert(result1.audit.processed == 6, f"Expected 6 audit rows archived, got {result1.audit.processed}")
        _assert(result1.audit.pending is True, "Expected audit job to be pending after capped batches")

        _assert(_get_setting(db, "__maintenance.jobs.purge_sessions.last_error") == "", "Expected sessions last_error to clear")
        _assert(_get_setting(db, "__maintenance.jobs.archive_system_audit_logs.last_error") == "", "Expected audit last_error to clear")

        # Pending forces re-run even if interval not passed.
        tick2 = tick1 + timedelta(seconds=1)
        result2 = run_maintenance_tick(db, now=tick2)
        _assert(result2.sessions.processed == 5, f"Expected 5 sessions purged on second tick, got {result2.sessions.processed}")
        _assert(result2.sessions.pending is True, "Expected sessions job still pending")

        _assert(result2.audit.processed == 4, f"Expected remaining 4 audit rows archived, got {result2.audit.processed}")
        _assert(result2.audit.pending is False, "Expected audit job to complete on second tick")

        tick3 = tick2 + timedelta(seconds=1)
        result3 = run_maintenance_tick(db, now=tick3)
        _assert(result3.sessions.processed == 2, f"Expected remaining 2 sessions purged, got {result3.sessions.processed}")
        _assert(result3.sessions.pending is False, "Expected sessions job to complete on third tick")

        # Final state: only active session remains; only recent hot audit remains.
        _assert(db.query(Session).count() == 1, "Expected only 1 active session remaining")
        _assert(db.query(SystemAuditLog).count() == 1, "Expected only recent audit log remaining")
        _assert(db.query(SystemAuditLogArchive).count() == 10, "Expected 10 archived audit rows")

        print("OK: maintenance tick tests passed")
    finally:
        db.close()


if __name__ == "__main__":
    main()
