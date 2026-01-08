"""add order details fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-01-08 16:32:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_add_order_details'
down_revision: Union[str, None] = '0001_mysql_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add order details PDF fields
    op.add_column('orders', sa.Column('order_details_path', sa.String(500), nullable=True))
    op.add_column('orders', sa.Column('order_details_generated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'order_details_generated_at')
    op.drop_column('orders', 'order_details_path')
