"""Add vehicle_checkouts table.

Revision ID: 0006_add_vehicle_checkouts
Revises: 0005_archive_system_audit_and_session_indexes
Create Date: 2026-02-10
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0006_add_vehicle_checkouts"
down_revision = "0005_archive_system_audit_and_session_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_checkouts",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("vehicle", sa.String(50), nullable=False),
        sa.Column("checked_out_by", sa.String(255), nullable=False),
        sa.Column("purpose", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("checked_out_at", sa.DateTime, nullable=False),
        sa.Column("checked_in_at", sa.DateTime, nullable=True),
        sa.Column("checked_in_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    op.create_index("ix_vehicle_checkouts_vehicle", "vehicle_checkouts", ["vehicle"])
    op.create_index("ix_vehicle_checkouts_checked_in_at", "vehicle_checkouts", ["checked_in_at"])


def downgrade() -> None:
    op.drop_index("ix_vehicle_checkouts_checked_in_at", table_name="vehicle_checkouts")
    op.drop_index("ix_vehicle_checkouts_vehicle", table_name="vehicle_checkouts")
    op.drop_table("vehicle_checkouts")
