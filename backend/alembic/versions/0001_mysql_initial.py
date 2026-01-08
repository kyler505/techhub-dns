"""MySQL Initial Migration

Revision ID: 0001_mysql_initial
Revises:
Create Date: 2026-01-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0001_mysql_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create delivery_runs table first (referenced by orders)
    op.create_table('delivery_runs',
        sa.Column('id', sa.String(36), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('runner', sa.String(255), nullable=False),
        sa.Column('vehicle', sa.String(50), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='Active'),
        sa.Column('start_time', sa.DateTime, nullable=True),
        sa.Column('end_time', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False),
        sa.Column('updated_at', sa.DateTime, nullable=False),
    )

    # Create orders table
    op.create_table('orders',
        sa.Column('id', sa.String(36), primary_key=True, nullable=False),
        sa.Column('inflow_order_id', sa.String(255), nullable=False, unique=True),
        sa.Column('inflow_sales_order_id', sa.String(255), nullable=True),
        sa.Column('recipient_name', sa.String(255), nullable=True),
        sa.Column('recipient_contact', sa.String(255), nullable=True),
        sa.Column('delivery_location', sa.String(500), nullable=True),
        sa.Column('po_number', sa.String(255), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='picked'),
        sa.Column('assigned_deliverer', sa.String(255), nullable=True),
        sa.Column('issue_reason', sa.Text, nullable=True),
        sa.Column('tagged_at', sa.DateTime, nullable=True),
        sa.Column('tagged_by', sa.String(255), nullable=True),
        sa.Column('tag_data', sa.JSON, nullable=True),
        sa.Column('picklist_generated_at', sa.DateTime, nullable=True),
        sa.Column('picklist_generated_by', sa.String(255), nullable=True),
        sa.Column('picklist_path', sa.String(500), nullable=True),
        sa.Column('delivery_run_id', sa.String(36), sa.ForeignKey('delivery_runs.id'), nullable=True),
        sa.Column('qa_completed_at', sa.DateTime, nullable=True),
        sa.Column('qa_completed_by', sa.String(255), nullable=True),
        sa.Column('qa_data', sa.JSON, nullable=True),
        sa.Column('qa_path', sa.String(500), nullable=True),
        sa.Column('qa_method', sa.String(50), nullable=True),
        sa.Column('signature_captured_at', sa.DateTime, nullable=True),
        sa.Column('signed_picklist_path', sa.String(500), nullable=True),
        sa.Column('shipping_workflow_status', sa.String(50), nullable=True, server_default='work_area'),
        sa.Column('shipping_workflow_status_updated_at', sa.DateTime, nullable=True),
        sa.Column('shipping_workflow_status_updated_by', sa.String(255), nullable=True),
        sa.Column('shipped_to_carrier_at', sa.DateTime, nullable=True),
        sa.Column('shipped_to_carrier_by', sa.String(255), nullable=True),
        sa.Column('carrier_name', sa.String(100), nullable=True),
        sa.Column('tracking_number', sa.String(255), nullable=True),
        sa.Column('inflow_data', sa.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False),
        sa.Column('updated_at', sa.DateTime, nullable=False),
    )
    op.create_index('ix_orders_inflow_order_id', 'orders', ['inflow_order_id'])
    op.create_index('ix_orders_status', 'orders', ['status'])
    op.create_index('ix_orders_delivery_run_id', 'orders', ['delivery_run_id'])

    # Create audit_logs table
    op.create_table('audit_logs',
        sa.Column('id', sa.String(36), primary_key=True, nullable=False),
        sa.Column('order_id', sa.String(36), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('changed_by', sa.String(255), nullable=True),
        sa.Column('from_status', sa.String(50), nullable=True),
        sa.Column('to_status', sa.String(50), nullable=False),
        sa.Column('reason', sa.Text, nullable=True),
        sa.Column('timestamp', sa.DateTime, nullable=False),
        sa.Column('metadata', sa.JSON, nullable=True),
    )
    op.create_index('ix_audit_logs_order_id', 'audit_logs', ['order_id'])
    op.create_index('ix_audit_logs_timestamp', 'audit_logs', ['timestamp'])

    # Create system_audit_logs table
    op.create_table('system_audit_logs',
        sa.Column('id', sa.String(36), primary_key=True, nullable=False),
        sa.Column('entity_type', sa.String(100), nullable=False),
        sa.Column('entity_id', sa.String(36), nullable=False),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('user_id', sa.String(255), nullable=True),
        sa.Column('user_role', sa.String(100), nullable=True),
        sa.Column('old_value', sa.JSON, nullable=True),
        sa.Column('new_value', sa.JSON, nullable=True),
        sa.Column('metadata', sa.JSON, nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text, nullable=True),
        sa.Column('timestamp', sa.DateTime, nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False),
    )
    op.create_index('ix_system_audit_logs_entity_type', 'system_audit_logs', ['entity_type'])
    op.create_index('ix_system_audit_logs_entity_id', 'system_audit_logs', ['entity_id'])
    op.create_index('ix_system_audit_logs_timestamp', 'system_audit_logs', ['timestamp'])

    # Create teams_config table
    op.create_table('teams_config',
        sa.Column('id', sa.String(36), primary_key=True, nullable=False),
        sa.Column('webhook_url', sa.String(500), nullable=True),
        sa.Column('updated_at', sa.DateTime, nullable=False),
        sa.Column('updated_by', sa.String(255), nullable=True),
    )

    # Create teams_notifications table
    op.create_table('teams_notifications',
        sa.Column('id', sa.String(36), primary_key=True, nullable=False),
        sa.Column('order_id', sa.String(36), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('teams_message_id', sa.String(255), nullable=True),
        sa.Column('sent_at', sa.DateTime, nullable=True),
        sa.Column('status', sa.Enum('pending', 'sent', 'failed', name='notificationstatus'), nullable=False, server_default='pending'),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('retry_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('webhook_url', sa.String(500), nullable=True),
        sa.Column('notification_type', sa.String(50), nullable=False, server_default='in_delivery'),
        sa.Column('created_at', sa.DateTime, nullable=False),
    )
    op.create_index('ix_teams_notifications_order_id', 'teams_notifications', ['order_id'])
    op.create_index('ix_teams_notifications_teams_message_id', 'teams_notifications', ['teams_message_id'])
    op.create_index('ix_teams_notifications_status', 'teams_notifications', ['status'])
    op.create_index('ix_teams_notifications_notification_type', 'teams_notifications', ['notification_type'])

    # Create inflow_webhooks table
    op.create_table('inflow_webhooks',
        sa.Column('id', sa.String(36), primary_key=True, nullable=False),
        sa.Column('webhook_id', sa.String(255), nullable=False, unique=True),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('events', sa.JSON, nullable=False),
        sa.Column('status', sa.Enum('active', 'inactive', 'failed', name='webhookstatus'), nullable=False, server_default='active'),
        sa.Column('last_received_at', sa.DateTime, nullable=True),
        sa.Column('failure_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('secret', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False),
        sa.Column('updated_at', sa.DateTime, nullable=False),
    )
    op.create_index('ix_inflow_webhooks_webhook_id', 'inflow_webhooks', ['webhook_id'])
    op.create_index('ix_inflow_webhooks_status', 'inflow_webhooks', ['status'])


def downgrade() -> None:
    op.drop_table('inflow_webhooks')
    op.drop_table('teams_notifications')
    op.drop_table('teams_config')
    op.drop_table('system_audit_logs')
    op.drop_table('audit_logs')
    op.drop_table('orders')
    op.drop_table('delivery_runs')
