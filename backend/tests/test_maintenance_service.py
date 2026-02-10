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
    from app.services.maintenance_service import archive_system_audit_logs, purge_sessions
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

        print("OK: maintenance service tests passed")
    finally:
        db.close()


if __name__ == "__main__":
    main()
