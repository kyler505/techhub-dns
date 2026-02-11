from __future__ import annotations

import logging
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.sql import insert

from app.config import settings
from app.models.audit_log import SystemAuditLog, SystemAuditLogArchive
from app.models.session import Session as UserSession


logger = logging.getLogger(__name__)


def purge_sessions(db: DbSession, *, now: Optional[datetime] = None) -> int:
    """Delete expired or revoked sessions.

    Purge condition:
    - revoked_at IS NOT NULL
    - OR expires_at < now
    """

    purge_now = now or datetime.utcnow()

    deleted = (
        db.query(UserSession)
        .filter(or_(UserSession.revoked_at.isnot(None), UserSession.expires_at < purge_now))
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted or 0)


def purge_sessions_batched(
    db: DbSession,
    *,
    now: Optional[datetime] = None,
    limit: int = 5000,
) -> int:
    """Delete expired or revoked sessions in bounded batches.

    This is intended for traffic-driven maintenance ticks where we need to
    cap work per request.
    """

    if limit <= 0:
        return 0

    purge_now = now or datetime.utcnow()

    ids = (
        db.query(UserSession.id)
        .filter(or_(UserSession.revoked_at.isnot(None), UserSession.expires_at < purge_now))
        .order_by(UserSession.expires_at.asc(), UserSession.id.asc())
        .limit(int(limit))
        .all()
    )
    id_values = [row[0] for row in ids if row and row[0]]
    if not id_values:
        return 0

    deleted = (
        db.query(UserSession)
        .filter(UserSession.id.in_(id_values))
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted or 0)


@dataclass(frozen=True)
class AuditArchiveRunResult:
    moved: int
    has_more: bool


def archive_system_audit_logs(
    db: DbSession,
    *,
    cutoff: Optional[datetime] = None,
    batch_size: Optional[int] = None,
) -> int:
    """Move old system audit logs from hot table to archive.

    Safety properties:
    - Idempotent: inserts are "ignore duplicates"; reruns after crash are safe.
    - Crash-safe: each batch does insert -> delete -> commit.
    """

    effective_batch_size = batch_size or int(getattr(settings, "system_audit_archive_batch_size", 1000) or 1000)
    effective_batch_size = max(1, min(effective_batch_size, 10_000))

    if cutoff is None:
        archive_days = int(getattr(settings, "system_audit_archive_days", 90) or 90)
        cutoff = datetime.utcnow() - timedelta(days=max(1, archive_days))

    result = archive_system_audit_logs_bounded(db, cutoff=cutoff, batch_size=effective_batch_size, max_batches=None)
    return int(result.moved)


def archive_system_audit_logs_bounded(
    db: DbSession,
    *,
    cutoff: Optional[datetime] = None,
    batch_size: Optional[int] = None,
    max_batches: Optional[int] = None,
) -> AuditArchiveRunResult:
    """Move old system audit logs with an optional per-call batch cap."""

    effective_batch_size = int(batch_size or getattr(settings, "system_audit_archive_batch_size", 1000) or 1000)
    effective_batch_size = max(1, min(effective_batch_size, 10_000))

    if cutoff is None:
        archive_days = int(getattr(settings, "system_audit_archive_days", 90) or 90)
        cutoff = datetime.utcnow() - timedelta(days=max(1, archive_days))

    if max_batches is not None and max_batches <= 0:
        return AuditArchiveRunResult(moved=0, has_more=_has_old_system_audit_logs(db, cutoff=cutoff))

    total_moved = 0
    dialect = _get_dialect_name(db)
    batches_run = 0

    while True:
        if max_batches is not None and batches_run >= max_batches:
            break

        rows = (
            db.query(SystemAuditLog)
            .filter(SystemAuditLog.timestamp < cutoff)
            .order_by(SystemAuditLog.timestamp.asc(), SystemAuditLog.id.asc())
            .limit(effective_batch_size)
            .all()
        )
        if not rows:
            break

        ids = [str(r.id) for r in rows if getattr(r, "id", None)]
        if not ids:
            break

        values = [_system_audit_log_values(r) for r in rows]
        _insert_archive_rows(db, values, dialect=dialect)

        deleted = (
            db.query(SystemAuditLog)
            .filter(SystemAuditLog.id.in_(ids))
            .delete(synchronize_session=False)
        )

        db.commit()
        total_moved += int(deleted or 0)
        batches_run += 1

    has_more = _has_old_system_audit_logs(db, cutoff=cutoff)
    return AuditArchiveRunResult(moved=int(total_moved), has_more=bool(has_more))


def _get_dialect_name(db: DbSession) -> str:
    bind = getattr(db, "bind", None)
    if bind is None:
        try:
            bind = db.get_bind()
        except Exception:
            bind = None

    dialect = getattr(bind, "dialect", None) if bind is not None else None
    name = getattr(dialect, "name", "") if dialect is not None else ""
    return str(name or "")


def _has_old_system_audit_logs(db: DbSession, *, cutoff: datetime) -> bool:
    row = (
        db.query(SystemAuditLog.id)
        .filter(SystemAuditLog.timestamp < cutoff)
        .order_by(SystemAuditLog.timestamp.asc(), SystemAuditLog.id.asc())
        .limit(1)
        .first()
    )
    return row is not None


def _system_audit_log_values(row: SystemAuditLog) -> dict[str, Any]:
    return {
        "id": row.id,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "action": row.action,
        "description": row.description,
        "user_id": row.user_id,
        "user_role": row.user_role,
        "old_value": row.old_value,
        "new_value": row.new_value,
        "metadata": row.audit_metadata,
        "ip_address": row.ip_address,
        "user_agent": row.user_agent,
        "timestamp": row.timestamp,
        "created_at": row.created_at,
    }


def _insert_archive_rows(db: DbSession, values: list[dict[str, Any]], *, dialect: str) -> None:
    if not values:
        return

    stmt = insert(SystemAuditLogArchive.__table__).values(values)

    if dialect == "mysql":
        stmt = stmt.prefix_with("IGNORE")
    elif dialect == "sqlite":
        stmt = stmt.prefix_with("OR IGNORE")

    try:
        db.execute(stmt)
        return
    except IntegrityError:
        db.rollback()

    # Fallback: best-effort per-row insert ignoring duplicates.
    for value in values:
        try:
            single = insert(SystemAuditLogArchive.__table__).values(value)
            if dialect == "mysql":
                single = single.prefix_with("IGNORE")
            elif dialect == "sqlite":
                single = single.prefix_with("OR IGNORE")
            db.execute(single)
        except IntegrityError:
            db.rollback()
            continue
