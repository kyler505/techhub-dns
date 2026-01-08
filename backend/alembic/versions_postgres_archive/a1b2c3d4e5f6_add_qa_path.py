"""Add QA storage path to orders.

Revision ID: a1b2c3d4e5f6
Revises: f2c9b8a1d3e4
Create Date: 2025-12-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f2c9b8a1d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("qa_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "qa_path")
