"""
Order Splitting Service for handling partial pick remainder orders.

When a partial pick order is delivered, this service creates a local remainder
order to track the unpicked items, linking back to the same InFlow sales order.
"""
import logging
import uuid
from copy import deepcopy
from datetime import datetime
from typing import Optional, Dict, Any, Tuple, List, Literal

from sqlalchemy.orm import Session

from app.models.order import Order, OrderStatus
from app.models.audit_log import AuditLog
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

    @staticmethod
    def _parse_standard_quantity(quantity_value: Any) -> float:
        if isinstance(quantity_value, dict):
            quantity_value = quantity_value.get("standardQuantity", 0)
        try:
            return float(quantity_value or 0)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _copy_line_with_quantity(
        line: Dict[str, Any], quantity: float, serial_numbers: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        copied_line = deepcopy(line)
        quantity_data = dict(copied_line.get("quantity") or {})
        quantity_data["standardQuantity"] = str(quantity)
        if serial_numbers is not None:
            quantity_data["serialNumbers"] = list(serial_numbers)
        copied_line["quantity"] = quantity_data
        return copied_line

    def _build_partial_leg_view(self, inflow_data: Dict[str, Any]) -> Dict[str, Any]:
        """Build a local snapshot for the picked leg of a partial order."""
        order_view = deepcopy(inflow_data or {})
        lines = order_view.get("lines", []) if isinstance(order_view, dict) else []
        pick_lines = order_view.get("pickLines", []) if isinstance(order_view, dict) else []

        if not isinstance(lines, list):
            lines = []
        if not isinstance(pick_lines, list):
            pick_lines = []

        picked_quantities: Dict[str, float] = {}
        picked_serials: Dict[str, List[str]] = {}

        for pick_line in pick_lines:
            if not isinstance(pick_line, dict):
                continue
            product_id = pick_line.get("productId")
            if not product_id:
                continue
            product_key = str(product_id)
            picked_quantities[product_key] = picked_quantities.get(product_key, 0.0) + self._parse_standard_quantity(
                pick_line.get("quantity")
            )
            serial_numbers = pick_line.get("quantity", {}).get("serialNumbers", []) or []
            if serial_numbers:
                picked_serials.setdefault(product_key, []).extend(
                    str(serial_number)
                    for serial_number in serial_numbers
                    if serial_number is not None
                )

        picked_lines: List[Dict[str, Any]] = []
        subtotal = 0.0

        for line in lines:
            if not isinstance(line, dict):
                continue
            product_id = line.get("productId")
            if not product_id:
                continue

            product_key = str(product_id)
            picked_qty = picked_quantities.get(product_key, 0.0)
            if picked_qty <= 0:
                continue

            line_serial_numbers = picked_serials.get(product_key)
            if line_serial_numbers:
                quantity = float(len(line_serial_numbers))
                picked_line = self._copy_line_with_quantity(
                    line, quantity, serial_numbers=line_serial_numbers
                )
            else:
                picked_line = self._copy_line_with_quantity(line, picked_qty)
                quantity = picked_qty

            raw_price = line.get("unitPrice")
            try:
                unit_price = float(raw_price or 0)
            except (TypeError, ValueError):
                unit_price = 0.0

            subtotal += unit_price * quantity
            picked_lines.append(picked_line)

        order_view["lines"] = picked_lines
        order_view["pickLines"] = deepcopy(picked_lines)
        order_view["packLines"] = []
        order_view["shipLines"] = []
        order_view["subtotal"] = subtotal
        order_view["total"] = subtotal
        return order_view

    def _build_remainder_leg_state(self, inflow_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Build the persisted inflow snapshot for the remainder leg."""
        if not inflow_data:
            return None

        remaining_lines, _ = self.get_remainder_items(inflow_data)
        remainder_view = deepcopy(inflow_data)
        remainder_view["lines"] = remaining_lines
        remainder_view["pickLines"] = []
        remainder_view["packLines"] = []
        remainder_view["shipLines"] = []
        remainder_view["subtotal"] = sum(
            (float(line.get("unitPrice") or 0) if isinstance(line, dict) else 0.0)
            * self._parse_standard_quantity(line.get("quantity") if isinstance(line, dict) else 0)
            for line in remaining_lines
            if isinstance(line, dict)
        )
        remainder_view["total"] = remainder_view["subtotal"]
        return remainder_view

    def _get_partial_remainder_source(self, original_order: Order) -> Optional[Dict[str, Any]]:
        """Build the current inflow snapshot for the parent remainder leg."""
        if not original_order.inflow_data:
            return None
        if original_order.parent_order_id or not original_order.remainder_order_id:
            return None

        return deepcopy(original_order.inflow_data)

    def _subtract_lines(
        self,
        source_lines: List[Dict[str, Any]],
        subtract_lines: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Subtract one line set from another by product and quantity."""
        subtract_quantities: Dict[str, float] = {}
        subtract_serials: Dict[str, List[str]] = {}

        for line in subtract_lines:
            if not isinstance(line, dict):
                continue
            product_id = line.get("productId")
            if not product_id:
                continue
            product_key = str(product_id)
            subtract_quantities[product_key] = subtract_quantities.get(product_key, 0.0) + self._parse_standard_quantity(
                line.get("quantity")
            )
            serial_numbers = line.get("quantity", {}).get("serialNumbers", []) or []
            if serial_numbers:
                subtract_serials.setdefault(product_key, []).extend(
                    str(serial_number)
                    for serial_number in serial_numbers
                    if serial_number is not None
                )

        remaining_lines: List[Dict[str, Any]] = []
        remaining_subtract_quantities = dict(subtract_quantities)

        for line in source_lines:
            if not isinstance(line, dict):
                continue
            product_id = line.get("productId")
            if not product_id:
                continue

            product_key = str(product_id)
            copied_line = deepcopy(line)
            quantity_data = dict(copied_line.get("quantity") or {})
            line_quantity = self._parse_standard_quantity(quantity_data)
            serial_numbers = [
                str(serial_number)
                for serial_number in (quantity_data.get("serialNumbers", []) or [])
                if serial_number is not None
            ]

            if serial_numbers and subtract_serials.get(product_key):
                remaining_serials = list(serial_numbers)
                for serial_number in subtract_serials[product_key]:
                    if serial_number in remaining_serials:
                        remaining_serials.remove(serial_number)
                if not remaining_serials:
                    continue
                quantity_data["serialNumbers"] = remaining_serials
                quantity_data["standardQuantity"] = float(len(remaining_serials))
                copied_line["quantity"] = quantity_data
                remaining_lines.append(copied_line)
                continue

            subtract_quantity = remaining_subtract_quantities.get(product_key, 0.0)
            remaining_quantity = line_quantity - subtract_quantity
            if remaining_quantity <= 0.0001:
                remaining_subtract_quantities[product_key] = max(-remaining_quantity, 0.0)
                continue

            quantity_data["standardQuantity"] = remaining_quantity
            copied_line["quantity"] = quantity_data
            remaining_lines.append(copied_line)
            remaining_subtract_quantities[product_key] = 0.0

        return remaining_lines

    def _restrict_lines_to_source(
        self,
        candidate_lines: List[Dict[str, Any]],
        allowed_lines: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Limit candidate lines to the quantities/serials available on the allowed line set."""
        allowed_quantities: Dict[str, float] = {}
        allowed_serials: Dict[str, List[str]] = {}

        for line in allowed_lines:
            if not isinstance(line, dict):
                continue
            product_id = line.get("productId")
            if not product_id:
                continue
            product_key = str(product_id)
            allowed_quantities[product_key] = allowed_quantities.get(product_key, 0.0) + self._parse_standard_quantity(
                line.get("quantity")
            )
            serial_numbers = line.get("quantity", {}).get("serialNumbers", []) or []
            if serial_numbers:
                allowed_serials.setdefault(product_key, []).extend(
                    str(serial_number)
                    for serial_number in serial_numbers
                    if serial_number is not None
                )

        restricted_lines: List[Dict[str, Any]] = []

        for line in candidate_lines:
            if not isinstance(line, dict):
                continue
            product_id = line.get("productId")
            if not product_id:
                continue

            product_key = str(product_id)
            available_quantity = allowed_quantities.get(product_key, 0.0)
            if available_quantity <= 0.0001:
                continue

            copied_line = deepcopy(line)
            quantity_data = dict(copied_line.get("quantity") or {})
            serial_numbers = [
                str(serial_number)
                for serial_number in (quantity_data.get("serialNumbers", []) or [])
                if serial_number is not None
            ]

            if serial_numbers and allowed_serials.get(product_key):
                remaining_allowed_serials = allowed_serials[product_key]
                matched_serials: List[str] = []
                for serial_number in serial_numbers:
                    if serial_number in remaining_allowed_serials:
                        matched_serials.append(serial_number)
                        remaining_allowed_serials.remove(serial_number)
                if not matched_serials:
                    continue
                quantity_data["serialNumbers"] = matched_serials
                quantity_data["standardQuantity"] = float(len(matched_serials))
                copied_line["quantity"] = quantity_data
                restricted_lines.append(copied_line)
                allowed_quantities[product_key] = max(
                    available_quantity - float(len(matched_serials)),
                    0.0,
                )
                continue

            line_quantity = self._parse_standard_quantity(quantity_data)
            restricted_quantity = min(line_quantity, available_quantity)
            if restricted_quantity <= 0.0001:
                continue

            quantity_data["standardQuantity"] = restricted_quantity
            copied_line["quantity"] = quantity_data
            restricted_lines.append(copied_line)
            allowed_quantities[product_key] = max(
                available_quantity - restricted_quantity,
                0.0,
            )

        return restricted_lines

    def _build_parent_remainder_assigned_view(
        self,
        original_order: Order,
        pick_lines_mode: Literal["stored", "lines"] = "stored",
    ) -> Optional[Dict[str, Any]]:
        """Build the remainder-leg item set for a parent order after a partial split."""
        remainder_source = self._get_partial_remainder_source(original_order)
        if not remainder_source:
            return None

        assigned_view = deepcopy(remainder_source)
        source_lines = [
            line
            for line in assigned_view.get("lines", [])
            if isinstance(line, dict)
        ]
        if not source_lines:
            assigned_view["lines"] = []
            assigned_view["pickLines"] = []
            assigned_view["packLines"] = []
            assigned_view["shipLines"] = []
            assigned_view["subtotal"] = 0.0
            assigned_view["total"] = 0.0
            return assigned_view

        child_order = (
            self.db.query(Order)
            .filter(Order.id == original_order.remainder_order_id)
            .first()
        )
        child_lines = []
        if child_order and isinstance(child_order.inflow_data, dict):
            child_lines = [
                line
                for line in child_order.inflow_data.get("lines", [])
                if isinstance(line, dict)
            ]

        derived_lines = self._subtract_lines(source_lines, child_lines) if child_lines else []
        if derived_lines and derived_lines != source_lines:
            source_lines = derived_lines

        normalized_lines: List[Dict[str, Any]] = []
        subtotal = 0.0

        for line in source_lines:
            copied_line = deepcopy(line)
            quantity_data = dict(copied_line.get("quantity") or {})
            quantity_value = self._parse_standard_quantity(quantity_data)
            quantity_data["standardQuantity"] = quantity_value
            copied_line["quantity"] = quantity_data
            raw_price = copied_line.get("unitPrice")
            try:
                unit_price = float(raw_price or 0)
            except (TypeError, ValueError):
                unit_price = 0.0
            subtotal += unit_price * quantity_value
            normalized_lines.append(copied_line)

        assigned_view["lines"] = normalized_lines
        if pick_lines_mode == "lines":
            assigned_view["pickLines"] = deepcopy(normalized_lines)
        else:
            stored_pick_lines = [
                line
                for line in assigned_view.get("pickLines", [])
                if isinstance(line, dict)
            ]
            if child_lines and stored_pick_lines:
                stored_pick_lines = self._subtract_lines(stored_pick_lines, child_lines)
            assigned_view["pickLines"] = self._restrict_lines_to_source(
                stored_pick_lines,
                normalized_lines,
            )
        assigned_view["packLines"] = []
        assigned_view["shipLines"] = []
        assigned_view["subtotal"] = subtotal
        assigned_view["total"] = subtotal
        return assigned_view

    def build_parent_remainder_document_view(self, original_order: Order) -> Optional[Dict[str, Any]]:
        """Build the remainder-only document snapshot for a parent partial leg."""
        return self._build_parent_remainder_assigned_view(original_order, pick_lines_mode="stored")

    def build_parent_remainder_pick_status_source(self, original_order: Order) -> Optional[Dict[str, Any]]:
        """Build the pick-status snapshot for a parent partial leg."""
        return self._build_parent_remainder_assigned_view(original_order, pick_lines_mode="stored")

    def build_parent_remainder_picklist_view(self, original_order: Order) -> Optional[Dict[str, Any]]:
        """Build the picklist payload for a parent remainder leg."""
        return self._build_parent_remainder_assigned_view(original_order, pick_lines_mode="lines")

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

        if order.parent_order_id or order.has_remainder or order.remainder_order_id:
            return False

        # Don't create remainder for remainder orders
        if order.inflow_order_id and order.inflow_order_id.endswith("-R"):
            return False

        pick_status = self.inflow_service.get_pick_status(order.inflow_data)
        return not pick_status.get("is_fully_picked", True)

    def create_partial_picklist_leg(
        self, original_order: Order, user_id: Optional[str] = None
    ) -> Optional[Order]:
        """Create a local child order containing the picked leg for a partial order."""
        if not original_order.inflow_data:
            return None

        if original_order.parent_order_id:
            return original_order

        if original_order.remainder_order_id:
            existing = (
                self.db.query(Order)
                .filter(Order.id == original_order.remainder_order_id)
                .first()
            )
            if existing:
                original_order.has_remainder = "Y"
                remainder_leg_state = self._build_remainder_leg_state(original_order.inflow_data)
                if remainder_leg_state is not None and original_order.inflow_data != remainder_leg_state:
                    original_order.inflow_data = remainder_leg_state
                    original_order.updated_at = datetime.utcnow()
                    self.db.commit()
                    self.db.refresh(original_order)
                logger.info(
                    "Partial leg already exists for %s; keeping parent %s active",
                    original_order.inflow_order_id,
                    original_order.id,
                )
                original_order.updated_at = datetime.utcnow()
                self.db.commit()
                self.db.refresh(original_order)
                return existing

        pick_status = self.inflow_service.get_pick_status(original_order.inflow_data)
        if pick_status.get("is_fully_picked", True):
            return None

        leg_order_id = f"{original_order.inflow_order_id}-P"
        existing = (
            self.db.query(Order).filter(Order.inflow_order_id == leg_order_id).first()
        )
        if existing:
            original_order.has_remainder = "Y"
            original_order.remainder_order_id = existing.id
            original_order.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            return existing

        picked_leg_inflow_data = self._build_partial_leg_view(original_order.inflow_data)
        remainder_leg_state = self._build_remainder_leg_state(original_order.inflow_data)

        child_order = Order(
            id=str(uuid.uuid4()),
            inflow_order_id=leg_order_id,
            inflow_sales_order_id=original_order.inflow_sales_order_id,
            recipient_name=original_order.recipient_name,
            recipient_contact=original_order.recipient_contact,
            delivery_location=original_order.delivery_location,
            po_number=original_order.po_number,
            status=OrderStatus.PICKED.value,
            tagged_at=original_order.tagged_at,
            tagged_by=original_order.tagged_by,
            tag_data=deepcopy(original_order.tag_data) if original_order.tag_data else None,
            inflow_data=picked_leg_inflow_data,
            parent_order_id=str(original_order.id),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(child_order)
        self.db.flush()

        child_audit = AuditLog(
            order_id=child_order.id,
            changed_by=user_id or "system",
            from_status=None,
            to_status=OrderStatus.PICKED.value,
            reason=f"Partial picklist child created from {original_order.inflow_order_id}",
            timestamp=datetime.utcnow(),
        )
        self.db.add(child_audit)

        original_order.has_remainder = "Y"
        original_order.remainder_order_id = child_order.id
        if remainder_leg_state is not None:
            original_order.inflow_data = remainder_leg_state
        original_order.updated_at = datetime.utcnow()

        audit_service = AuditService(self.db)
        audit_service.log_order_action(
            order_id=str(original_order.id),
            action="partial_picklist_child_created",
            user_id=user_id,
            description=f"Created partial picklist child {leg_order_id}",
            audit_metadata={
                "child_order_id": str(child_order.id),
                "child_inflow_order_id": leg_order_id,
                "picked_line_count": len(picked_leg_inflow_data.get("pickLines", [])),
            },
        )
        audit_service.log_order_action(
            order_id=str(child_order.id),
            action="created_as_partial_picklist_leg",
            user_id=user_id,
            description=f"Created as partial picklist leg for order {original_order.inflow_order_id}",
            audit_metadata={
                "parent_order_id": str(original_order.id),
                "parent_inflow_order_id": original_order.inflow_order_id,
                "picked_line_count": len(picked_leg_inflow_data.get("pickLines", [])),
            },
        )

        self.db.commit()
        self.db.refresh(child_order)

        logger.info(
            "Created partial picklist child %s for parent %s",
            child_order.inflow_order_id,
            original_order.inflow_order_id,
        )
        return child_order

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
        # Check if remainder already exists
        remainder_order_id = f"{original_order.inflow_order_id}-R"
        existing = self.db.query(Order).filter(
            Order.inflow_order_id == remainder_order_id
        ).first()

        if existing:
            logger.info(f"Remainder order {remainder_order_id} already exists")
            return existing

        if not self.should_create_remainder(original_order):
            logger.info(f"No remainder needed for order {original_order.inflow_order_id}")
            return None

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
        self.db.flush()

        # Create AuditLog entry for initial 'picked' status in timeline
        audit_log = AuditLog(
            order_id=remainder_order.id,
            changed_by=user_id or "system",
            from_status=None,  # No previous status - order was just created
            to_status=OrderStatus.PICKED.value,
            reason=f"Remainder order created from {original_order.inflow_order_id}",
            timestamp=datetime.utcnow()
        )
        self.db.add(audit_log)

        # Update original order to mark that it has a remainder
        original_order.has_remainder = 'Y'
        original_order.remainder_order_id = remainder_order.id
        original_order.updated_at = datetime.utcnow()

        # Also log to system audit log for full traceability
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
