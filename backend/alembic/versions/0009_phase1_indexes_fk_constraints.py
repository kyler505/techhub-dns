"""Phase 1: add indexes + FK constraints for MySQL refactor.

Revision ID: 0009_phase1_indexes_fk_constraints
Revises: 0008_add_checkout_type_to_vehicle_checkouts
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0009_phase1_indexes_fk_constraints"
down_revision = "0008_add_checkout_type_to_vehicle_checkouts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("orders") as batch_op:
            # Orders: single-column indexes for common sort/filter fields.
            batch_op.create_index("ix_orders_created_at", ["created_at"])
            batch_op.create_index("ix_orders_updated_at", ["updated_at"])
            batch_op.create_index("ix_orders_signature_captured_at", ["signature_captured_at"])

            # Orders: composite indexes for status dashboards.
            batch_op.create_index("ix_orders_status_updated_at", ["status", "updated_at"])
            batch_op.create_index(
                "ix_orders_status_tagged_at_updated_at",
                ["status", "tagged_at", "updated_at"],
            )

            # Orders: add FK constraints for remainder tracking.
            batch_op.create_foreign_key(
                "fk_orders_parent_order_id",
                "orders",
                ["parent_order_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_foreign_key(
                "fk_orders_remainder_order_id",
                "orders",
                ["remainder_order_id"],
                ["id"],
                ondelete="SET NULL",
            )
    else:
        # Orders: single-column indexes for common sort/filter fields.
        op.create_index("ix_orders_created_at", "orders", ["created_at"])
        op.create_index("ix_orders_updated_at", "orders", ["updated_at"])
        op.create_index("ix_orders_signature_captured_at", "orders", ["signature_captured_at"])

        # Orders: composite indexes for status dashboards.
        op.create_index("ix_orders_status_updated_at", "orders", ["status", "updated_at"])
        op.create_index(
            "ix_orders_status_tagged_at_updated_at",
            "orders",
            ["status", "tagged_at", "updated_at"],
        )

        # Orders: add FK constraints for remainder tracking.
        op.create_foreign_key(
            "fk_orders_parent_order_id",
            "orders",
            "orders",
            ["parent_order_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_foreign_key(
            "fk_orders_remainder_order_id",
            "orders",
            "orders",
            ["remainder_order_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Vehicle checkouts: lookup by vehicle + checked_in, and checked_out timestamp.
    op.create_index(
        "ix_vehicle_checkouts_vehicle_checked_in_at",
        "vehicle_checkouts",
        ["vehicle", "checked_in_at"],
    )
    op.create_index("ix_vehicle_checkouts_checked_out_at", "vehicle_checkouts", ["checked_out_at"])

    # Teams notifications: composite index for order status history.
    op.create_index(
        "ix_teams_notifications_order_status_sent_at",
        "teams_notifications",
        ["order_id", "status", "sent_at"],
    )

    # Inflow webhooks: status + updated time for operational views.
    op.create_index("ix_inflow_webhooks_status_updated_at", "inflow_webhooks", ["status", "updated_at"])

    # Sessions: user + created time for activity queries.
    op.create_index("ix_sessions_user_id_created_at", "sessions", ["user_id", "created_at"])

    # Orders: case-insensitive lookup support for inflow_order_id.
    if bind.dialect.name == "mysql":
        op.add_column(
            "orders",
            sa.Column(
                "inflow_order_id_lower",
                sa.String(255),
                sa.Computed("lower(inflow_order_id)", persisted=True),
            ),
        )
        op.create_index(
            "ix_orders_inflow_order_id_lower",
            "orders",
            ["inflow_order_id_lower"],
        )
    elif bind.dialect.name == "sqlite":
        op.execute(
            "CREATE INDEX ix_orders_inflow_order_id_lower "
            "ON orders (lower(inflow_order_id))"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.drop_index("ix_orders_inflow_order_id_lower", table_name="orders")
        op.drop_column("orders", "inflow_order_id_lower")
    elif bind.dialect.name == "sqlite":
        op.drop_index("ix_orders_inflow_order_id_lower")

    op.drop_index("ix_sessions_user_id_created_at", table_name="sessions")
    op.drop_index("ix_inflow_webhooks_status_updated_at", table_name="inflow_webhooks")
    op.drop_index("ix_teams_notifications_order_status_sent_at", table_name="teams_notifications")
    op.drop_index("ix_vehicle_checkouts_checked_out_at", table_name="vehicle_checkouts")
    op.drop_index("ix_vehicle_checkouts_vehicle_checked_in_at", table_name="vehicle_checkouts")

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("orders") as batch_op:
            batch_op.drop_constraint("fk_orders_remainder_order_id", type_="foreignkey")
            batch_op.drop_constraint("fk_orders_parent_order_id", type_="foreignkey")
            batch_op.drop_index("ix_orders_status_tagged_at_updated_at")
            batch_op.drop_index("ix_orders_status_updated_at")
            batch_op.drop_index("ix_orders_signature_captured_at")
            batch_op.drop_index("ix_orders_updated_at")
            batch_op.drop_index("ix_orders_created_at")
    else:
        op.drop_constraint("fk_orders_remainder_order_id", "orders", type_="foreignkey")
        op.drop_constraint("fk_orders_parent_order_id", "orders", type_="foreignkey")

        op.drop_index("ix_orders_status_tagged_at_updated_at", table_name="orders")
        op.drop_index("ix_orders_status_updated_at", table_name="orders")
        op.drop_index("ix_orders_signature_captured_at", table_name="orders")
        op.drop_index("ix_orders_updated_at", table_name="orders")
        op.drop_index("ix_orders_created_at", table_name="orders")
