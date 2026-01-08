"""add_system_audit_logs_table

Revision ID: a9cbe979c418
Revises: a7f9591831ab
Create Date: 2025-12-21 11:39:32.409061

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9cbe979c418'
down_revision: Union[str, None] = 'a7f9591831ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create system_audit_logs table
    op.create_table(
        'system_audit_logs',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('entity_type', sa.String(), nullable=False, index=True),
        sa.Column('entity_id', sa.String(), nullable=False, index=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('user_role', sa.String(), nullable=True),
        sa.Column('old_value', sa.JSON(), nullable=True),
        sa.Column('new_value', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False, default=sa.text('now()'), index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    # Drop system_audit_logs table
    op.drop_table('system_audit_logs')
