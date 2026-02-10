"""Add checkout_type to vehicle_checkouts.

Revision ID: 0008_add_checkout_type_to_vehicle_checkouts
Revises: 0007_vehicle_checkout_actor_fields
Create Date: 2026-02-10
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_add_checkout_type_to_vehicle_checkouts"
down_revision = "0007_vehicle_checkout_actor_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Non-null with a default so existing rows are backfilled.
    op.add_column(
        "vehicle_checkouts",
        sa.Column("checkout_type", sa.String(50), nullable=False, server_default="delivery_run"),
    )

    # Explicitly backfill any NULLs (defensive for some backends).
    op.execute("UPDATE vehicle_checkouts SET checkout_type='delivery_run' WHERE checkout_type IS NULL")

    # Drop server default to avoid silently masking missing values from buggy clients.
    # SQLite doesn't support ALTER COLUMN DROP DEFAULT.
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.alter_column("vehicle_checkouts", "checkout_type", server_default=None)


def downgrade() -> None:
    op.drop_column("vehicle_checkouts", "checkout_type")
