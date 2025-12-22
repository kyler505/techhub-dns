"""merge heads

Revision ID: c2d3e4f5g6h7
Revises: 34d179c32c4f, b1c2d3e4f5g6
Create Date: 2025-12-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5g6h7'
down_revision: Union[str, None] = ('34d179c32c4f', 'b1c2d3e4f5g6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Merge migration - no actual database changes needed
    # This migration simply brings together the two branches:
    # 34d179c32c4f (standardize_status_names) and
    # b1c2d3e4f5g6 (add_shipping_workflow_fields)
    pass


def downgrade() -> None:
    # Merge migration - no rollback needed
    pass
