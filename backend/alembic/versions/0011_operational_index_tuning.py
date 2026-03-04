"""Operational index tuning for delivery runs and audit lookups.

Revision ID: 0011_operational_index_tuning
Revises: 0010_phase2_normalization
Create Date: 2026-03-04
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0011_operational_index_tuning"
down_revision = "0010_phase2_normalization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Delivery run listing/filters:
    # - active/status lists ordered by created_at
    # - vehicle + status filters ordered by created_at
    op.create_index(
        "ix_delivery_runs_status_created_at_id",
        "delivery_runs",
        ["status", "created_at", "id"],
    )
    op.create_index(
        "ix_delivery_runs_vehicle_status_created_at_id",
        "delivery_runs",
        ["vehicle", "status", "created_at", "id"],
    )

    # Entity-scoped system audit timelines (hot and archive).
    op.create_index(
        "ix_system_audit_logs_entity_type_entity_id_timestamp_id",
        "system_audit_logs",
        ["entity_type", "entity_id", "timestamp", "id"],
    )
    op.create_index(
        "ix_system_audit_logs_archive_entity_type_entity_id_timestamp_id",
        "system_audit_logs_archive",
        ["entity_type", "entity_id", "timestamp", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_system_audit_logs_archive_entity_type_entity_id_timestamp_id",
        table_name="system_audit_logs_archive",
    )
    op.drop_index(
        "ix_system_audit_logs_entity_type_entity_id_timestamp_id",
        table_name="system_audit_logs",
    )
    op.drop_index(
        "ix_delivery_runs_vehicle_status_created_at_id",
        table_name="delivery_runs",
    )
    op.drop_index(
        "ix_delivery_runs_status_created_at_id",
        table_name="delivery_runs",
    )
