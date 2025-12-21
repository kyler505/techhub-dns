"""Add shipping status to order status enum.

Revision ID: 20251219_add_shipping_status
Revises: f2c9b8a1d3e4
Create Date: 2025-12-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20251219_add_shipping_status"
down_revision: Union[str, None] = "f2c9b8a1d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'SHIPPING'")


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values directly
    # In production, you would need to:
    # 1. Create a new enum without the value
    # 2. Update all records using the old value
    # 3. Replace the column type
    # 4. Drop the old enum
    pass
