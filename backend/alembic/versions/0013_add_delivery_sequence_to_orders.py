"""add delivery sequence to orders

Revision ID: 0013
Revises: 0012
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("orders", sa.Column("delivery_sequence", sa.Integer(), nullable=True))
    op.create_index(
        "ix_orders_delivery_run_id_delivery_sequence",
        "orders",
        ["delivery_run_id", "delivery_sequence"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_orders_delivery_run_id_delivery_sequence", table_name="orders")
    op.drop_column("orders", "delivery_sequence")
