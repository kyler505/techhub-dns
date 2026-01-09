"""Add remainder order tracking fields

Revision ID: 0003_add_remainder_fields
Revises: 0002_add_order_details_fields
Create Date: 2026-01-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003_add_remainder_fields'
down_revision: Union[str, None] = '0002_add_order_details'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add remainder order tracking fields
    op.add_column('orders', sa.Column('parent_order_id', sa.String(36), nullable=True))
    op.add_column('orders', sa.Column('has_remainder', sa.String(1), nullable=True))
    op.add_column('orders', sa.Column('remainder_order_id', sa.String(36), nullable=True))

    # Add index for parent_order_id for efficient lookups
    op.create_index('ix_orders_parent_order_id', 'orders', ['parent_order_id'])


def downgrade() -> None:
    op.drop_index('ix_orders_parent_order_id', 'orders')
    op.drop_column('orders', 'remainder_order_id')
    op.drop_column('orders', 'has_remainder')
    op.drop_column('orders', 'parent_order_id')
