from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from flask import after_this_request
from sqlalchemy import text
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.database import get_db
from app.models.session import Session as UserSession
from app.models.system_setting import SystemSetting
from app.services.maintenance_service import (
    archive_system_audit_logs_bounded,
    purge_sessions_batched,
)


logger = logging.getLogger(__name__)


_LAST_TICK_SCHEDULED_MONOTONIC: Optional[float] = None


SETTING_SESSIONS_LAST_SUCCESS = "__maintenance.jobs.purge_sessions.last_success"
SETTING_SESSIONS_LAST_ERROR = "__maintenance.jobs.purge_sessions.last_error"
SETTING_SESSIONS_PENDING = "__maintenance.jobs.purge_sessions.pending"

SETTING_AUDIT_LAST_SUCCESS = "__maintenance.jobs.archive_system_audit_logs.last_success"
SETTING_AUDIT_LAST_ERROR = "__maintenance.jobs.archive_system_audit_logs.last_error"
SETTING_AUDIT_PENDING = "__maintenance.jobs.archive_system_audit_logs.pending"


@dataclass(frozen=True)
class MaintenanceJobResult:
    ran: bool
    acquired_lock: bool
    processed: int
    pending: bool
    error: Optional[str]


@dataclass(frozen=True)
class MaintenanceTickResult:
    sessions: MaintenanceJobResult
    audit: MaintenanceJobResult


def schedule_maintenance_tick_if_needed() -> None:
    """Schedule a best-effort maintenance tick after the response closes."""

    if not getattr(settings, "maintenance_tick_enabled", True):
        return

    min_interval = int(getattr(settings, "maintenance_tick_min_interval_seconds", 60) or 60)
    min_interval = max(1, min(min_interval, 3600))

    global _LAST_TICK_SCHEDULED_MONOTONIC
    now_mono = time.monotonic()
    if _LAST_TICK_SCHEDULED_MONOTONIC is not None:
        if (now_mono - _LAST_TICK_SCHEDULED_MONOTONIC) < float(min_interval):
            return

    _LAST_TICK_SCHEDULED_MONOTONIC = now_mono

    @after_this_request
    def _attach_on_close(response):
        response.call_on_close(_run_tick_on_close_best_effort)
        return response


def _run_tick_on_close_best_effort() -> None:
    try:
        with get_db() as db:
            result = run_maintenance_tick(db)
            if result.sessions.ran or result.audit.ran:
                logger.info(
                    "Maintenance tick: sessions purged=%s pending=%s audit archived=%s pending=%s",
                    result.sessions.processed,
                    result.sessions.pending,
                    result.audit.processed,
                    result.audit.pending,
                )
            if result.sessions.error or result.audit.error:
                logger.warning(
                    "Maintenance tick errors: sessions=%s audit=%s",
                    result.sessions.error,
                    result.audit.error,
                )
    except Exception:
        logger.exception("Maintenance tick crashed")


def run_maintenance_tick(db: DbSession, *, now: Optional[datetime] = None) -> MaintenanceTickResult:
    """Run due maintenance jobs with DB-persisted state.

    Intended to be called from response.on_close and from scriptable tests.
    """

    tick_now = now or datetime.now(timezone.utc)
    tick_now = tick_now.astimezone(timezone.utc).replace(microsecond=0)

    sessions = _run_purge_sessions_job(db, tick_now=tick_now)
    audit = _run_archive_audit_job(db, tick_now=tick_now)
    return MaintenanceTickResult(sessions=sessions, audit=audit)


def _run_purge_sessions_job(db: DbSession, *, tick_now: datetime) -> MaintenanceJobResult:
    if not _job_is_due(
        db,
        last_success_key=SETTING_SESSIONS_LAST_SUCCESS,
        pending_key=SETTING_SESSIONS_PENDING,
        tick_now=tick_now,
        interval_hours=int(getattr(settings, "maintenance_sessions_purge_interval_hours", 24) or 24),
    ):
        return MaintenanceJobResult(ran=False, acquired_lock=False, processed=0, pending=False, error=None)

    lock_name = "maintenance:purge_sessions"
    with _advisory_lock(db, lock_name) as acquired:
        if not acquired:
            return MaintenanceJobResult(ran=False, acquired_lock=False, processed=0, pending=True, error=None)

        batch_size = int(getattr(settings, "maintenance_sessions_purge_batch_size", 5000) or 5000)
        batch_size = max(1, min(batch_size, 50_000))
        purge_now_naive = tick_now.replace(tzinfo=None)

        try:
            deleted = purge_sessions_batched(db, now=purge_now_naive, limit=batch_size)
            pending = _has_sessions_to_purge(db, purge_now_naive)
            _set_setting(db, SETTING_SESSIONS_PENDING, "true" if pending else "false")
            _set_setting(db, SETTING_SESSIONS_LAST_SUCCESS, tick_now.isoformat())
            _set_setting(db, SETTING_SESSIONS_LAST_ERROR, "")
            return MaintenanceJobResult(
                ran=True,
                acquired_lock=True,
                processed=int(deleted),
                pending=bool(pending),
                error=None,
            )
        except Exception as exc:
            db.rollback()
            message = _truncate_error(f"{type(exc).__name__}: {exc}")
            _set_setting(db, SETTING_SESSIONS_LAST_ERROR, message)
            return MaintenanceJobResult(ran=True, acquired_lock=True, processed=0, pending=True, error=message)


def _run_archive_audit_job(db: DbSession, *, tick_now: datetime) -> MaintenanceJobResult:
    if not _job_is_due(
        db,
        last_success_key=SETTING_AUDIT_LAST_SUCCESS,
        pending_key=SETTING_AUDIT_PENDING,
        tick_now=tick_now,
        interval_hours=int(getattr(settings, "maintenance_audit_archive_interval_hours", 24) or 24),
    ):
        return MaintenanceJobResult(ran=False, acquired_lock=False, processed=0, pending=False, error=None)

    lock_name = "maintenance:archive_system_audit_logs"
    with _advisory_lock(db, lock_name) as acquired:
        if not acquired:
            return MaintenanceJobResult(ran=False, acquired_lock=False, processed=0, pending=True, error=None)

        max_batches = int(getattr(settings, "maintenance_audit_archive_max_batches_per_tick", 3) or 3)
        max_batches = max(1, min(max_batches, 100))

        try:
            result = archive_system_audit_logs_bounded(db, max_batches=max_batches)
            pending = bool(result.has_more)
            _set_setting(db, SETTING_AUDIT_PENDING, "true" if pending else "false")
            _set_setting(db, SETTING_AUDIT_LAST_SUCCESS, tick_now.isoformat())
            _set_setting(db, SETTING_AUDIT_LAST_ERROR, "")
            return MaintenanceJobResult(
                ran=True,
                acquired_lock=True,
                processed=int(result.moved),
                pending=pending,
                error=None,
            )
        except Exception as exc:
            db.rollback()
            message = _truncate_error(f"{type(exc).__name__}: {exc}")
            _set_setting(db, SETTING_AUDIT_LAST_ERROR, message)
            return MaintenanceJobResult(ran=True, acquired_lock=True, processed=0, pending=True, error=message)


def _job_is_due(
    db: DbSession,
    *,
    last_success_key: str,
    pending_key: str,
    tick_now: datetime,
    interval_hours: int,
) -> bool:
    interval_hours = max(1, min(int(interval_hours or 24), 24 * 365))

    pending = (_get_setting(db, pending_key) or "").strip().lower() in ("true", "1", "yes", "on")
    if pending:
        return True

    last_success = _parse_utc_iso(_get_setting(db, last_success_key))
    if last_success is None:
        return True

    due_at = last_success + timedelta(hours=interval_hours)
    return tick_now >= due_at


def _has_sessions_to_purge(db: DbSession, purge_now: datetime) -> bool:
    row = (
        db.query(UserSession.id)
        .filter((UserSession.revoked_at.isnot(None)) | (UserSession.expires_at < purge_now))
        .limit(1)
        .first()
    )
    return row is not None


@contextmanager
def _advisory_lock(db: DbSession, lock_name: str):
    dialect = _get_dialect_name(db)
    if dialect != "mysql":
        yield True
        return

    acquired = False
    try:
        value = db.execute(text("SELECT GET_LOCK(:name, 0)"), {"name": lock_name}).scalar()
        acquired = int(value or 0) == 1
    except Exception:
        logger.exception("Failed to acquire advisory lock %s", lock_name)
        acquired = False

    try:
        yield acquired
    finally:
        if acquired:
            try:
                db.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": lock_name})
            except Exception:
                logger.exception("Failed to release advisory lock %s", lock_name)


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


def _get_setting(db: DbSession, key: str) -> Optional[str]:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row is None:
        return None
    value = getattr(row, "value", None)
    if value is None:
        return None
    return str(value)


def _set_setting(db: DbSession, key: str, value: str) -> None:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row is None:
        row = SystemSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()


def _parse_utc_iso(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None

    candidate = raw
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _truncate_error(message: str, *, max_length: int = 500) -> str:
    normalized = str(message or "").strip()
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 3] + "..."
