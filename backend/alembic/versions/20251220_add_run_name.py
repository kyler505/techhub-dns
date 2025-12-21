"""Add name column to delivery_runs table

Revision ID: 20251220_add_run_name
Revises: 20251219_add_delivery_run
Create Date: 2025-12-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251220_add_run_name"
down_revision = "20251219_add_delivery_run"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add name column to delivery_runs table
    op.add_column('delivery_runs', sa.Column('name', sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    # Remove name column from delivery_runs table
    op.drop_column('delivery_runs', 'name')
