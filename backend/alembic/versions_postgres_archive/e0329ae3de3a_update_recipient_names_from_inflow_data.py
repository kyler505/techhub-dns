"""update_recipient_names_from_inflow_data

Revision ID: e0329ae3de3a
Revises: c2d3e4f5g6h7
Create Date: 2025-12-22 16:02:14.363884

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e0329ae3de3a'
down_revision: Union[str, None] = 'c2d3e4f5g6h7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update all orders to set recipient_name from inflow_data.contactName
    op.execute("""
        UPDATE orders
        SET recipient_name = inflow_data->>'contactName'
        WHERE inflow_data IS NOT NULL
        AND inflow_data->>'contactName' IS NOT NULL
        AND (recipient_name IS NULL OR recipient_name != inflow_data->>'contactName')
    """)


def downgrade() -> None:
    # This migration updates data in place, so we cannot reliably rollback.
    # The recipient_name field will retain the updated values.
    # If rollback is needed, manual intervention would be required to restore
    # the previous recipient_name values from backups or other sources.
    pass
