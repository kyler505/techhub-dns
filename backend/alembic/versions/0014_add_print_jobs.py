"""add print jobs

Revision ID: 0014_add_print_jobs
Revises: 0013_add_delivery_sequence_to_orders
Create Date: 2026-03-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_add_print_jobs"
down_revision = "0013_add_delivery_sequence_to_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "print_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("order_id", sa.String(length=36), nullable=False),
        sa.Column("document_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("trigger_source", sa.String(length=50), nullable=False),
        sa.Column("requested_by", sa.String(length=255), nullable=True),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("claim_expires_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_print_jobs_order_id", "print_jobs", ["order_id"], unique=False)
    op.create_index(
        "ix_print_jobs_claim_expires_at",
        "print_jobs",
        ["claim_expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_print_jobs_order_document_created_at",
        "print_jobs",
        ["order_id", "document_type", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_print_jobs_status_created_at",
        "print_jobs",
        ["status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_print_jobs_status_created_at", table_name="print_jobs")
    op.drop_index("ix_print_jobs_order_document_created_at", table_name="print_jobs")
    op.drop_index("ix_print_jobs_claim_expires_at", table_name="print_jobs")
    op.drop_index("ix_print_jobs_order_id", table_name="print_jobs")
    op.drop_table("print_jobs")
