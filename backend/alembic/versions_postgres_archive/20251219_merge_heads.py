"""Merge multiple heads: a1b2c3d4e5f6 and 20251219_add_delivery_run

Revision ID: 20251219_merge_heads
Revises: 20251219_add_delivery_run, a1b2c3d4e5f6
Create Date: 2025-12-19 00:10:00.000000

This merge revision resolves multiple head revisions by creating a no-op merge.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "20251219_merge_heads"
down_revision = ("20251219_add_delivery_run", "a1b2c3d4e5f6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is a merge revision to unify multiple heads. No DB changes.
    pass


def downgrade() -> None:
    pass
