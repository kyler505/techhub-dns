"""Add picked status and prep tracking fields.

Revision ID: e3a9a4a5b8c9
Revises: 8c142b1fbf6c
Create Date: 2025-12-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e3a9a4a5b8c9"
down_revision: Union[str, None] = "8c142b1fbf6c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'PICKED'")

    op.execute(
        "UPDATE orders "
        "SET status = 'PICKED' "
        "WHERE status::text IN ('PreDelivery', 'PRE_DELIVERY')"
    )

    op.add_column("orders", sa.Column("tagged_at", sa.DateTime(), nullable=True))
    op.add_column("orders", sa.Column("tagged_by", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("tag_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("orders", sa.Column("picklist_generated_at", sa.DateTime(), nullable=True))
    op.add_column("orders", sa.Column("picklist_generated_by", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("picklist_path", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("qa_completed_at", sa.DateTime(), nullable=True))
    op.add_column("orders", sa.Column("qa_completed_by", sa.String(), nullable=True))
    op.add_column("orders", sa.Column("qa_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("orders", sa.Column("signature_captured_at", sa.DateTime(), nullable=True))
    op.add_column("orders", sa.Column("signed_picklist_path", sa.String(), nullable=True))

    op.add_column(
        "teams_notifications",
        sa.Column(
            "notification_type",
            sa.String(),
            nullable=False,
            server_default="in_delivery"
        )
    )
    op.create_index(
        op.f("ix_teams_notifications_notification_type"),
        "teams_notifications",
        ["notification_type"],
        unique=False
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_teams_notifications_notification_type"),
        table_name="teams_notifications"
    )
    op.drop_column("teams_notifications", "notification_type")

    op.drop_column("orders", "signed_picklist_path")
    op.drop_column("orders", "signature_captured_at")
    op.drop_column("orders", "qa_data")
    op.drop_column("orders", "qa_completed_by")
    op.drop_column("orders", "qa_completed_at")
    op.drop_column("orders", "picklist_path")
    op.drop_column("orders", "picklist_generated_by")
    op.drop_column("orders", "picklist_generated_at")
    op.drop_column("orders", "tag_data")
    op.drop_column("orders", "tagged_by")
    op.drop_column("orders", "tagged_at")
