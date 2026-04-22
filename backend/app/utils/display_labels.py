"""Shared helpers for turning stored user identifiers into human labels."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user import User


def resolve_user_display(db_session: Session, value: str) -> str:
    value_norm = (value or "").strip()
    if not value_norm or "@" not in value_norm:
        return value_norm

    user = db_session.query(User).filter(User.email == value_norm).first()
    display_name = (user.display_name or "").strip() if user else ""
    return display_name or value_norm


def resolve_runner_display(db_session: Session, runner: str) -> str:
    return resolve_user_display(db_session, runner)
