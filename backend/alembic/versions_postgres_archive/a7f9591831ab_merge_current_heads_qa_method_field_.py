"""Merge current heads: qa_method_field, merge_heads, and add_run_name

Revision ID: a7f9591831ab
Revises: 20251219_add_qa_method_field, 20251219_merge_heads, 20251220_add_run_name
Create Date: 2025-12-20 23:33:30.333879

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7f9591831ab'
down_revision: Union[str, None] = ('20251219_add_qa_method_field', '20251219_merge_heads', '20251220_add_run_name')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
