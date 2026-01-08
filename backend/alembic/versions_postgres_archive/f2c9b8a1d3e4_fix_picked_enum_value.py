"""Fix picked enum value casing.

Revision ID: f2c9b8a1d3e4
Revises: e3a9a4a5b8c9
Create Date: 2025-12-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f2c9b8a1d3e4"
down_revision: Union[str, None] = "e3a9a4a5b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'PICKED'")
    op.execute(
        "UPDATE orders "
        "SET status = 'PICKED' "
        "WHERE status::text IN ('Picked', 'PreDelivery', 'PRE_DELIVERY')"
    )


def downgrade() -> None:
    pass
