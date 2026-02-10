"""Add session purge indexes and system audit archive table.

Revision ID: 0005_archive_system_audit_and_session_indexes
Revises: 0004_add_system_settings
Create Date: 2026-02-09
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_archive_system_audit_and_session_indexes"
down_revision = "0004_add_system_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Sessions: indexes to support purge + active-session queries.
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_index("ix_sessions_revoked_at", "sessions", ["revoked_at"])

    # Archive table for system audit logs.
    op.create_table(
        "system_audit_logs_archive",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("user_id", sa.String(255), nullable=True),
        sa.Column("user_role", sa.String(100), nullable=True),
        sa.Column("old_value", sa.JSON, nullable=True),
        sa.Column("new_value", sa.JSON, nullable=True),
        sa.Column("metadata", sa.JSON, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )

    op.create_index(
        "ix_system_audit_logs_archive_entity_type",
        "system_audit_logs_archive",
        ["entity_type"],
    )
    op.create_index(
        "ix_system_audit_logs_archive_entity_id",
        "system_audit_logs_archive",
        ["entity_id"],
    )
    op.create_index(
        "ix_system_audit_logs_archive_timestamp",
        "system_audit_logs_archive",
        ["timestamp"],
    )
    op.create_index(
        "ix_system_audit_logs_archive_timestamp_id",
        "system_audit_logs_archive",
        ["timestamp", "id"],
    )

    # Hot table cursor pagination: composite index to match (timestamp, id) ordering.
    op.create_index(
        "ix_system_audit_logs_timestamp_id",
        "system_audit_logs",
        ["timestamp", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_system_audit_logs_timestamp_id", table_name="system_audit_logs")

    op.drop_index("ix_system_audit_logs_archive_timestamp_id", table_name="system_audit_logs_archive")
    op.drop_index("ix_system_audit_logs_archive_timestamp", table_name="system_audit_logs_archive")
    op.drop_index("ix_system_audit_logs_archive_entity_id", table_name="system_audit_logs_archive")
    op.drop_index("ix_system_audit_logs_archive_entity_type", table_name="system_audit_logs_archive")
    op.drop_table("system_audit_logs_archive")

    op.drop_index("ix_sessions_revoked_at", table_name="sessions")
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
