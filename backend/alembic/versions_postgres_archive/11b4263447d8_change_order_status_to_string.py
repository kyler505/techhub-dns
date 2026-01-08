"""change_order_status_to_string

Revision ID: 11b4263447d8
Revises: a9cbe979c418
Create Date: 2025-12-21 12:19:31.863095

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11b4263447d8'
down_revision: Union[str, None] = 'a9cbe979c418'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Change status column from enum to string first
    op.alter_column('orders', 'status', type_=sa.String(), existing_type=sa.Enum('orderstatus'))

    # Then convert enum values to match our new string values
    op.execute(
        "UPDATE orders SET status = CASE "
        "WHEN status = 'PICKED' THEN 'Picked' "
        "WHEN status = 'PRE_DELIVERY' THEN 'PreDelivery' "
        "WHEN status = 'IN_DELIVERY' THEN 'InDelivery' "
        "WHEN status = 'SHIPPING' THEN 'Shipping' "
        "WHEN status = 'DELIVERED' THEN 'Delivered' "
        "WHEN status = 'ISSUE' THEN 'Issue' "
        "ELSE status END"
    )


def downgrade() -> None:
    # Change status column back from string to enum
    op.alter_column('orders', 'status', type_=sa.Enum('PICKED', 'PRE_DELIVERY', 'IN_DELIVERY', 'SHIPPING', 'DELIVERED', 'ISSUE', name='orderstatus'), existing_type=sa.String())
