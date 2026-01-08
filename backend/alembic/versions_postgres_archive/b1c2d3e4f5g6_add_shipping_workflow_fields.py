"""add_shipping_workflow_fields

Revision ID: b1c2d3e4f5g6
Revises: a9cbe979c418
Create Date: 2025-12-22 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5g6'
down_revision: Union[str, None] = 'a9cbe979c418'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add shipping workflow fields to orders table
    op.add_column('orders', sa.Column('shipping_workflow_status', sa.String(), nullable=True, default='work_area'))
    op.add_column('orders', sa.Column('shipping_workflow_status_updated_at', sa.DateTime(), nullable=True))
    op.add_column('orders', sa.Column('shipping_workflow_status_updated_by', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('shipped_to_carrier_at', sa.DateTime(), nullable=True))
    op.add_column('orders', sa.Column('shipped_to_carrier_by', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('carrier_name', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('tracking_number', sa.String(), nullable=True))


def downgrade() -> None:
    # Remove shipping workflow fields from orders table
    op.drop_column('orders', 'tracking_number')
    op.drop_column('orders', 'carrier_name')
    op.drop_column('orders', 'shipped_to_carrier_by')
    op.drop_column('orders', 'shipped_to_carrier_at')
    op.drop_column('orders', 'shipping_workflow_status_updated_by')
    op.drop_column('orders', 'shipping_workflow_status_updated_at')
    op.drop_column('orders', 'shipping_workflow_status')
