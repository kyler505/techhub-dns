"""Add user identity fields to vehicle_checkouts.

Revision ID: 0007_vehicle_checkout_actor_fields
Revises: 0006_add_vehicle_checkouts
Create Date: 2026-02-10
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0007_vehicle_checkout_actor_fields"
down_revision = "0006_add_vehicle_checkouts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehicle_checkouts",
        sa.Column("checked_out_by_user_id", sa.String(36), nullable=True),
    )
    op.add_column(
        "vehicle_checkouts",
        sa.Column("checked_out_by_email", sa.String(255), nullable=True),
    )
    op.add_column(
        "vehicle_checkouts",
        sa.Column("checked_out_by_display_name", sa.String(255), nullable=True),
    )

    op.add_column(
        "vehicle_checkouts",
        sa.Column("checked_in_by_user_id", sa.String(36), nullable=True),
    )
    op.add_column(
        "vehicle_checkouts",
        sa.Column("checked_in_by_email", sa.String(255), nullable=True),
    )
    op.add_column(
        "vehicle_checkouts",
        sa.Column("checked_in_by_display_name", sa.String(255), nullable=True),
    )

    op.create_index(
        "ix_vehicle_checkouts_checked_out_by_user_id",
        "vehicle_checkouts",
        ["checked_out_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_vehicle_checkouts_checked_out_by_user_id", table_name="vehicle_checkouts")

    op.drop_column("vehicle_checkouts", "checked_in_by_display_name")
    op.drop_column("vehicle_checkouts", "checked_in_by_email")
    op.drop_column("vehicle_checkouts", "checked_in_by_user_id")

    op.drop_column("vehicle_checkouts", "checked_out_by_display_name")
    op.drop_column("vehicle_checkouts", "checked_out_by_email")
    op.drop_column("vehicle_checkouts", "checked_out_by_user_id")
