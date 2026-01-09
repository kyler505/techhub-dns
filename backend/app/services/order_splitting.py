"""
Order Splitting Service for handling partial pick remainder orders.

When a partial pick order is delivered, this service creates a local remainder
order to track the unpicked items, linking back to the same InFlow sales order.
"""
import uuid
import logging
from datetime import datetime
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from copy import deepcopy

from app.models.order import Order, OrderStatus
from app.services.inflow_service import InflowService
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class OrderSplittingService:
    """Service for splitting partial pick orders into remainder orders."""

    def __init__(self, db: Session):
        self.db = db
        self.inflow_service = InflowService()

    def get_remainder_items(self, inflow_data: Dict[str, Any]) -> Tuple[list, list]:
        """
        Calculate remaining items that were not picked.

        Returns:
            Tuple of (remaining_lines, all_lines_with_remaining_quantity)
        """
        if not inflow_data:
            return [], []

        lines = inflow_data.get("lines", [])
        pick_lines = inflow_data.get("pickLines", [])

        # Build map of picked quantities by product ID
        picked = {}
        for line in pick_lines:
            pid = line.get("productId")
            qty = 0
            try:
                qty = float(line.get("quantity", {}).get("standardQuantity", 0) or 0)
            except (ValueError, TypeError):
                pass
            if pid:
                picked[pid] = picked.get(pid, 0) + qty

        # Calculate remaining for each line
        remaining_lines = []
        for line in lines:
            pid = line.get("productId")
            ordered_qty = 0
            try:
                ordered_qty = float(line.get("quantity", {}).get("standardQuantity", 0) or 0)
            except (ValueError, TypeError):
                pass

            picked_qty = picked.get(pid, 0)
            remaining_qty = ordered_qty - picked_qty

            if remaining_qty > 0.0001:  # Use tolerance for float comparison
                # Create a copy of the line with remaining quantity
                remaining_line = deepcopy(line)
                remaining_line["quantity"]["standardQuantity"] = remaining_qty
                remaining_lines.append(remaining_line)

        return remaining_lines, lines

    def should_create_remainder(self, order: Order) -> bool:
        """
        Check if a remainder order should be created for this order.

        Returns True if:
        - Order has inflow_data
        - Order is not already a remainder (doesn't have -R suffix)
        - Order has items that weren't fully picked
        """
        if not order.inflow_data:
            return False

        # Don't create remainder for remainder orders
        if order.inflow_order_id and order.inflow_order_id.endswith("-R"):
            return False

        pick_status = self.inflow_service.get_pick_status(order.inflow_data)
        return not pick_status.get("is_fully_picked", True)

    def create_remainder_order(
        self,
        original_order: Order,
        user_id: Optional[str] = None
    ) -> Optional[Order]:
        """
        Create a remainder order for unpicked items from a partial pick order.

        Args:
            original_order: The original order that was partially picked
            user_id: User who triggered the creation

        Returns:
            The newly created remainder order, or None if no remainder needed
        """
        if not self.should_create_remainder(original_order):
            logger.info(f"No remainder needed for order {original_order.inflow_order_id}")
            return None

        # Check if remainder already exists
        remainder_order_id = f"{original_order.inflow_order_id}-R"
        existing = self.db.query(Order).filter(
            Order.inflow_order_id == remainder_order_id
        ).first()

        if existing:
            logger.info(f"Remainder order {remainder_order_id} already exists")
            return existing

        # Get remaining items
        remaining_lines, _ = self.get_remainder_items(original_order.inflow_data)
        if not remaining_lines:
            return None

        # Create modified inflow_data with only remaining items
        remainder_inflow_data = deepcopy(original_order.inflow_data)
        remainder_inflow_data["lines"] = remaining_lines
        # Clear pick/pack/ship lines since this is a new order waiting for picking
        remainder_inflow_data["pickLines"] = []
        remainder_inflow_data["packLines"] = []
        remainder_inflow_data["shipLines"] = []

        # Create the remainder order
        remainder_order = Order(
            id=str(uuid.uuid4()),
            inflow_order_id=remainder_order_id,
            inflow_sales_order_id=original_order.inflow_sales_order_id,  # Same InFlow order!
            recipient_name=original_order.recipient_name,
            recipient_contact=original_order.recipient_contact,
            delivery_location=original_order.delivery_location,
            po_number=original_order.po_number,
            status=OrderStatus.PICKED.value,  # Initial state awaiting more picking
            inflow_data=remainder_inflow_data,
            parent_order_id=str(original_order.id),  # Track the parent order
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(remainder_order)

        # Update original order to mark that it has a remainder
        original_order.has_remainder = 'Y'
        original_order.remainder_order_id = remainder_order.id
        original_order.updated_at = datetime.utcnow()

        # Audit log
        audit_service = AuditService(self.db)

        # Log on original order
        audit_service.log_action(
            entity_type="order",
            entity_id=str(original_order.id),
            action="remainder_created",
            user_id=user_id,
            description=f"Remainder order {remainder_order_id} created for unpicked items",
            audit_metadata={
                "remainder_order_id": str(remainder_order.id),
                "remaining_items_count": len(remaining_lines)
            }
        )

        # Log on new remainder order
        audit_service.log_action(
            entity_type="order",
            entity_id=str(remainder_order.id),
            action="created_as_remainder",
            user_id=user_id,
            description=f"Created as remainder for order {original_order.inflow_order_id}",
            audit_metadata={
                "parent_order_id": str(original_order.id),
                "parent_inflow_order_id": original_order.inflow_order_id,
                "remaining_items_count": len(remaining_lines)
            }
        )

        self.db.commit()
        self.db.refresh(remainder_order)

        logger.info(f"Created remainder order {remainder_order_id} with {len(remaining_lines)} items")
        return remainder_order

    def process_partial_fulfillments(
        self,
        orders: list[Order],
        user_id: Optional[str] = None,
        create_remainders: bool = True
    ) -> Dict[str, Any]:
        """
        Process a batch of orders after delivery, creating remainder orders for partial picks.

        Args:
            orders: List of orders that were delivered
            user_id: User who completed the delivery
            create_remainders: Whether to create remainder orders (user confirmed)

        Returns:
            Summary of created remainders
        """
        results = {
            "remainder_count": 0,
            "remainders_created": [],
            "skipped": []
        }

        if not create_remainders:
            return results

        for order in orders:
            try:
                remainder = self.create_remainder_order(order, user_id)
                if remainder:
                    results["remainder_count"] += 1
                    results["remainders_created"].append({
                        "original_order_id": str(order.id),
                        "original_inflow_id": order.inflow_order_id,
                        "remainder_order_id": str(remainder.id),
                        "remainder_inflow_id": remainder.inflow_order_id
                    })
                else:
                    results["skipped"].append({
                        "order_id": str(order.id),
                        "inflow_id": order.inflow_order_id,
                        "reason": "no_remainder_needed"
                    })
            except Exception as e:
                logger.error(f"Failed to create remainder for {order.inflow_order_id}: {e}")
                results["skipped"].append({
                    "order_id": str(order.id),
                    "inflow_id": order.inflow_order_id,
                    "reason": str(e)
                })

        return results
