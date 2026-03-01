"""Phase 2: add order status history + user FKs.

Revision ID: 0010_phase2_normalization
Revises: 0009_phase1_indexes_fk_constraints
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0010_phase2_normalization"
down_revision = "0009_phase1_indexes_fk_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        "order_status_history",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("order_id", sa.String(36), nullable=False),
        sa.Column("from_status", sa.String(50), nullable=True),
        sa.Column("to_status", sa.String(50), nullable=False),
        sa.Column("changed_at", sa.DateTime, nullable=False),
        sa.Column("actor_user_id", sa.String(36), nullable=True),
        sa.Column("metadata", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name="fk_order_status_history_order_id"),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_order_status_history_actor_user_id",
            ondelete="SET NULL",
        ),
    )

    op.create_index(
        "ix_order_status_history_order_id_changed_at",
        "order_status_history",
        ["order_id", "changed_at"],
    )
    op.create_index(
        "ix_order_status_history_changed_at",
        "order_status_history",
        ["changed_at"],
    )

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("vehicle_checkouts") as batch_op:
            batch_op.create_foreign_key(
                "fk_vehicle_checkouts_checked_out_by_user_id",
                "users",
                ["checked_out_by_user_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_foreign_key(
                "fk_vehicle_checkouts_checked_in_by_user_id",
                "users",
                ["checked_in_by_user_id"],
                ["id"],
                ondelete="SET NULL",
            )
            # SQLite does not support IF NOT EXISTS for indexes via Alembic directly in batch,
            # but we can check if it exists or rely on it being idempotent if we weren't in a batch.
            # Since the user reported it already exists, it might have been created by a previous migration
            # but not recorded or similar. We'll use op.create_index with if_not_exists=True if possible,
            # but batch_op.create_index doesn't support it in all versions.
            # Actually, op.create_index is better outside batch if it was already there.
            # But the primary issue is it WAS added in 0007.
            # So we should probably NOT try to create it again if it exists.
            
            # Let's check for existence if we can, or just skip it in the batch.
            # Re-reading: 0007 already created 'ix_vehicle_checkouts_checked_out_by_user_id'.
            # 0010 tries to create it AGAIN.
            # The fix is to remove the duplicate index creation.
            batch_op.create_index(
                "ix_vehicle_checkouts_checked_in_by_user_id",
                ["checked_in_by_user_id"],
            )
    else:
        op.create_foreign_key(
            "fk_vehicle_checkouts_checked_out_by_user_id",
            "vehicle_checkouts",
            "users",
            ["checked_out_by_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_foreign_key(
            "fk_vehicle_checkouts_checked_in_by_user_id",
            "vehicle_checkouts",
            "users",
            ["checked_in_by_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(
            "ix_vehicle_checkouts_checked_in_by_user_id",
            "vehicle_checkouts",
            ["checked_in_by_user_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("vehicle_checkouts") as batch_op:
            batch_op.drop_index("ix_vehicle_checkouts_checked_in_by_user_id")
            batch_op.drop_constraint("fk_vehicle_checkouts_checked_in_by_user_id", type_="foreignkey")
            batch_op.drop_constraint("fk_vehicle_checkouts_checked_out_by_user_id", type_="foreignkey")
    else:
        op.drop_index("ix_vehicle_checkouts_checked_in_by_user_id", table_name="vehicle_checkouts")
        op.drop_constraint(
            "fk_vehicle_checkouts_checked_in_by_user_id",
            "vehicle_checkouts",
            type_="foreignkey",
        )
        op.drop_constraint(
            "fk_vehicle_checkouts_checked_out_by_user_id",
            "vehicle_checkouts",
            type_="foreignkey",
        )

    op.drop_index("ix_order_status_history_changed_at", table_name="order_status_history")
    op.drop_index("ix_order_status_history_order_id_changed_at", table_name="order_status_history")
    op.drop_table("order_status_history")
