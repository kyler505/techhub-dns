"""capitalize_delivery_run_statuses

Revision ID: 3eb65ddf7284
Revises: 11b4263447d8
Create Date: 2025-12-21 12:45:17.877544

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3eb65ddf7284'
down_revision: Union[str, None] = '11b4263447d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # First change the column from enum to string
    op.alter_column('delivery_runs', 'status', type_=sa.String(), existing_type=sa.Enum('delivery_run_status'))

    # Then update delivery run status values to be capitalized
    op.execute(
        "UPDATE delivery_runs SET status = CASE "
        "WHEN status = 'active' THEN 'Active' "
        "WHEN status = 'completed' THEN 'Completed' "
        "WHEN status = 'cancelled' THEN 'Cancelled' "
        "ELSE status END"
    )


def downgrade() -> None:
    # Revert delivery run status values to lowercase
    op.execute(
        "UPDATE delivery_runs SET status = CASE "
        "WHEN status = 'Active' THEN 'active' "
        "WHEN status = 'Completed' THEN 'completed' "
        "WHEN status = 'Cancelled' THEN 'cancelled' "
        "ELSE status END"
    )

    # Change the column back from string to enum
    op.alter_column('delivery_runs', 'status', type_=sa.Enum('active', 'completed', 'cancelled', name='delivery_run_status'), existing_type=sa.String())
