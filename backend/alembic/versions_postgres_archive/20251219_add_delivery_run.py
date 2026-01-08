"""Add delivery_runs table and delivery_run_id on orders

Revision ID: 20251219_add_delivery_run
Revises: f2c9b8a1d3e4
Create Date: 2025-12-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20251219_add_delivery_run"
down_revision = "f2c9b8a1d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enums
    vehicle_enum = postgresql.ENUM('van', 'golf_cart', name='vehicle_enum')
    vehicle_enum.create(op.get_bind(), checkfirst=True)

    delivery_run_status = postgresql.ENUM('active', 'completed', 'cancelled', name='delivery_run_status')
    delivery_run_status.create(op.get_bind(), checkfirst=True)

    # Create delivery_runs table
    vehicle_type = postgresql.ENUM('van', 'golf_cart', name='vehicle_enum', create_type=False)
    status_type = postgresql.ENUM('active', 'completed', 'cancelled', name='delivery_run_status', create_type=False)

    op.create_table(
        'delivery_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('runner', sa.String(), nullable=False),
        sa.Column('vehicle', vehicle_type, nullable=False),
        sa.Column('status', status_type, nullable=False, server_default=sa.text("'active'")),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )

    # Add delivery_run_id column to orders (nullable)
    op.add_column('orders', sa.Column('delivery_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index(op.f('ix_orders_delivery_run_id'), 'orders', ['delivery_run_id'], unique=False)
    op.create_foreign_key('fk_orders_delivery_run_id', 'orders', 'delivery_runs', ['delivery_run_id'], ['id'])


def downgrade() -> None:
    # Drop FK and column
    op.drop_constraint('fk_orders_delivery_run_id', 'orders', type_='foreignkey')
    op.drop_index(op.f('ix_orders_delivery_run_id'), table_name='orders')
    op.drop_column('orders', 'delivery_run_id')

    # Drop delivery_runs table
    op.drop_table('delivery_runs')

    # Drop enums
    delivery_run_status = postgresql.ENUM(name='delivery_run_status')
    delivery_run_status.drop(op.get_bind(), checkfirst=True)

    vehicle_enum = postgresql.ENUM(name='vehicle_enum')
    vehicle_enum.drop(op.get_bind(), checkfirst=True)
