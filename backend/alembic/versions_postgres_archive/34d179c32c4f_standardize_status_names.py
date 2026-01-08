"""standardize_status_names

Revision ID: 34d179c32c4f
Revises: 3eb65ddf7284
Create Date: 2025-12-22 00:40:27.247309

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '34d179c32c4f'
down_revision: Union[str, None] = '3eb65ddf7284'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update existing status values to kebab-case
    op.execute("""
        UPDATE orders SET status = 'picked' WHERE status = 'Picked';
        UPDATE orders SET status = 'pre-delivery' WHERE status = 'PreDelivery';
        UPDATE orders SET status = 'in-delivery' WHERE status = 'InDelivery';
        UPDATE orders SET status = 'shipping' WHERE status = 'Shipping';
        UPDATE orders SET status = 'delivered' WHERE status = 'Delivered';
        UPDATE orders SET status = 'issue' WHERE status = 'Issue';
    """)

    # Update enum definition (this will be handled by SQLAlchemy model changes)


def downgrade() -> None:
    # Revert to camelCase for downgrade
    op.execute("""
        UPDATE orders SET status = 'Picked' WHERE status = 'picked';
        UPDATE orders SET status = 'PreDelivery' WHERE status = 'pre-delivery';
        UPDATE orders SET status = 'InDelivery' WHERE status = 'in-delivery';
        UPDATE orders SET status = 'Shipping' WHERE status = 'shipping';
        UPDATE orders SET status = 'Delivered' WHERE status = 'delivered';
        UPDATE orders SET status = 'Issue' WHERE status = 'issue';
    """)
