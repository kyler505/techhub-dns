#!/usr/bin/env python3

import os
import sys
from datetime import datetime, timedelta


def _assert(condition: bool, message: str) -> None:
    if condition:
        return
    raise AssertionError(message)


def main() -> None:
    # Force an isolated in-memory DB so these tests never touch real data.
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"

    # Ensure backend/ is on sys.path when running as a script.
    sys.path.append(".")

    from app.database import Base, SessionLocal, engine
    from app.models.user import User
    from app.models.session import Session
    from app.models.audit_log import SystemAuditLog, SystemAuditLogArchive
    from app.services.maintenance_service import (
        archive_system_audit_logs,
        apply_system_audit_retention,
        purge_sessions,
    )
    from app.services import maintenance_service
    from app.services.saml_auth_service import saml_auth_service

    Base.metadata.create_all(bind=engine)

    now = datetime.utcnow()

    db = SessionLocal()
    try:
        user = User(
            tamu_oid="test-oid",
            email="test@example.com",
            display_name="Test User",
            created_at=now,
            last_login_at=now,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        active = Session(
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=1),
            revoked_at=None,
        )
        expired = Session(
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
            expires_at=now - timedelta(seconds=1),
            revoked_at=None,
        )
        revoked = Session(
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=1),
            revoked_at=now,
        )
        db.add_all([active, expired, revoked])
        db.commit()

        active_id = str(active.id)
        expired_id = str(expired.id)
        revoked_id = str(revoked.id)

        deleted = purge_sessions(db, now=now)
        _assert(deleted == 2, f"Expected 2 sessions purged, got {deleted}")

        sessions = saml_auth_service.get_user_sessions(db, user.id)
        session_ids = {s.id for s in sessions}
        _assert(active_id in session_ids, "Active session missing from get_user_sessions")
        _assert(expired_id not in session_ids, "Expired session returned by get_user_sessions")
        _assert(revoked_id not in session_ids, "Revoked session returned by get_user_sessions")

        old_ts = now - timedelta(days=120)
        cutoff = now - timedelta(days=90)
        recent_ts = now - timedelta(days=10)

        old_log = SystemAuditLog(
            entity_type="system",
            entity_id="system",
            action="old",
            description="old row",
            timestamp=old_ts,
            created_at=old_ts,
        )
        recent_log = SystemAuditLog(
            entity_type="system",
            entity_id="system",
            action="recent",
            description="recent row",
            timestamp=recent_ts,
            created_at=recent_ts,
        )
        db.add_all([old_log, recent_log])
        db.commit()

        moved = archive_system_audit_logs(db, cutoff=cutoff, batch_size=1)
        _assert(moved == 1, f"Expected 1 audit row archived, got {moved}")

        hot_count = db.query(SystemAuditLog).count()
        arch_count = db.query(SystemAuditLogArchive).count()
        _assert(hot_count == 1, f"Expected 1 hot audit row, got {hot_count}")
        _assert(arch_count == 1, f"Expected 1 archived audit row, got {arch_count}")

        moved_again = archive_system_audit_logs(db, cutoff=cutoff, batch_size=10)
        _assert(moved_again == 0, f"Expected 0 rows archived on rerun, got {moved_again}")

        duplicate_id = "00000000-0000-0000-0000-000000000001"
        new_id = "00000000-0000-0000-0000-000000000002"
        duplicate_ts = now - timedelta(days=200)

        duplicate_log = SystemAuditLog(
            id=duplicate_id,
            entity_type="system",
            entity_id="system",
            action="duplicate",
            description="duplicate row",
            timestamp=duplicate_ts,
            created_at=duplicate_ts,
        )
        new_log = SystemAuditLog(
            id=new_id,
            entity_type="system",
            entity_id="system",
            action="new",
            description="new row",
            timestamp=duplicate_ts,
            created_at=duplicate_ts,
        )
        archived_duplicate = SystemAuditLogArchive(
            id=duplicate_id,
            entity_type="system",
            entity_id="system",
            action="archived-duplicate",
            description="archived duplicate row",
            timestamp=duplicate_ts,
            created_at=duplicate_ts,
        )
        db.add_all([duplicate_log, new_log, archived_duplicate])
        db.commit()

        original_get_dialect_name = maintenance_service._get_dialect_name
        maintenance_service._get_dialect_name = lambda _db: "sqlite"
        try:
            moved_with_duplicate = archive_system_audit_logs(db, cutoff=cutoff, batch_size=10)
        finally:
            maintenance_service._get_dialect_name = original_get_dialect_name

        # On SQLite with OR IGNORE, both rows are considered "inserted" into the archive
        # and thus both are deleted from the hot table.
        _assert(moved_with_duplicate == 2, f"Expected 2 audit rows archived (including ignore), got {moved_with_duplicate}")

        remaining_hot_ids = {row.id for row in db.query(SystemAuditLog).all()}
        _assert(duplicate_id not in remaining_hot_ids, "Duplicate hot audit row should be removed on SQLite")
        _assert(new_id not in remaining_hot_ids, "New hot audit row should be removed after archiving")

        archived_ids = {row.id for row in db.query(SystemAuditLogArchive).all()}
        _assert(duplicate_id in archived_ids, "Archive should contain duplicate audit row")
        _assert(new_id in archived_ids, "Archive should contain newly archived audit row")

        # Cleanup before testing retention
        db.query(SystemAuditLog).delete()
        db.query(SystemAuditLogArchive).delete()
        db.commit()

        archived_old_ts = now - timedelta(days=400)
        archived_recent_ts = now - timedelta(days=30)

        archived_old = SystemAuditLogArchive(
            entity_type="system",
            entity_id="system",
            action="archived-old",
            description="archived old row",
            timestamp=archived_old_ts,
            created_at=archived_old_ts,
        )
        archived_recent = SystemAuditLogArchive(
            entity_type="system",
            entity_id="system",
            action="archived-recent",
            description="archived recent row",
            timestamp=archived_recent_ts,
            created_at=archived_recent_ts,
        )
        db.add_all([archived_old, archived_recent])
        db.commit()

        retention_result = apply_system_audit_retention(
            db,
            archive_cutoff=cutoff,
            archive_retention_days=365,
            batch_size=10,
        )
        _assert(retention_result.moved == 0, "Expected no additional archive moves")
        _assert(retention_result.deleted == 1, f"Expected 1 archived row deleted, got {retention_result.deleted}")

        remaining_archive = db.query(SystemAuditLogArchive).count()
        _assert(remaining_archive == 1, f"Expected 1 archived row remaining, got {remaining_archive}")

        print("OK: maintenance service tests passed")
    finally:
        db.close()


if __name__ == "__main__":
    main()
