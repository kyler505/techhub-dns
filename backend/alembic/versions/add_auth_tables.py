"""Add users and sessions tables for SAML authentication.

Revision ID: add_auth_tables
Revises:
Create Date: 2026-01-13

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_auth_tables'
down_revision = '0003_add_remainder_fields'  # Chain after remainder fields migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tamu_oid', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('email', sa.String(255), nullable=False, index=True),
        sa.Column('display_name', sa.String(255), nullable=True),
        sa.Column('department', sa.String(255), nullable=True),
        sa.Column('employee_id', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False),
        sa.Column('last_login_at', sa.DateTime, nullable=False),
    )

    # Create sessions table
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime, nullable=False),
        sa.Column('expires_at', sa.DateTime, nullable=False),
        sa.Column('last_seen_at', sa.DateTime, nullable=False),
        sa.Column('revoked_at', sa.DateTime, nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('sessions')
    op.drop_table('users')
