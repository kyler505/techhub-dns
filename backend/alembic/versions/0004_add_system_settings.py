"""Add system_settings table for dynamic configuration.

Revision ID: 0004_add_system_settings
Revises: add_auth_tables
Create Date: 2026-01-20
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0004_add_system_settings'
down_revision = 'add_auth_tables'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'system_settings',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('key', sa.String(100), nullable=False, unique=True, index=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by', sa.String(255), nullable=True),
    )


def downgrade():
    op.drop_table('system_settings')
