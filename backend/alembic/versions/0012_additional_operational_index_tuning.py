"""Additional operational index tuning.

Revision ID: 0012_additional_operational_index_tuning
Revises: 0011_operational_index_tuning
Create Date: 2026-03-04
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0012_additional_operational_index_tuning"
down_revision = "0011_operational_index_tuning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_audit_logs_order_id_timestamp",
        "audit_logs",
        ["order_id", "timestamp"],
    )
    op.create_index(
        "ix_delivery_runs_created_at",
        "delivery_runs",
        ["created_at"],
    )
    op.create_index(
        "ix_vehicle_checkouts_checkout_type_checked_out_at_id",
        "vehicle_checkouts",
        ["checkout_type", "checked_out_at", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_vehicle_checkouts_checkout_type_checked_out_at_id",
        table_name="vehicle_checkouts",
    )
    op.drop_index(
        "ix_delivery_runs_created_at",
        table_name="delivery_runs",
    )
    op.drop_index(
        "ix_audit_logs_order_id_timestamp",
        table_name="audit_logs",
    )
