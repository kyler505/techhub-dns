"""Add qa_method field to orders table.

Revision ID: 20251219_add_qa_method_field
Revises: 20251219_add_shipping_status
Create Date: 2025-12-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20251219_add_qa_method_field"
down_revision: Union[str, None] = "20251219_add_shipping_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("qa_method", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "qa_method")
