import re
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.models.order import Order, OrderStatus
from app.models.audit_log import AuditLog
from app.models.teams_notification import TeamsNotification, NotificationStatus
from app.services.teams_service import TeamsService
from app.utils.building_mapper import get_building_abbreviation, extract_building_code_from_location

logger = logging.getLogger(__name__)


class OrderService:
    def __init__(self, db: Session):
        self.db = db
        self.teams_service = TeamsService(db)

    def get_orders(
        self,
        status: Optional[OrderStatus] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> tuple[List[Order], int]:
        """Get orders with filters and pagination"""
        query = self.db.query(Order)

        if status:
            query = query.filter(Order.status == status)

        if search:
            search_filter = or_(
                Order.inflow_order_id.ilike(f"%{search}%"),
                Order.recipient_name.ilike(f"%{search}%"),
                Order.delivery_location.ilike(f"%{search}%"),
                Order.po_number.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)

        total = query.count()
        orders = query.order_by(Order.updated_at.desc()).offset(skip).limit(limit).all()

        return orders, total

    def get_order_detail(self, order_id: UUID) -> Optional[Order]:
        """Get order with related data (audit logs, notifications)"""
        return self.db.query(Order).options(
            selectinload(Order.audit_logs),
            selectinload(Order.teams_notifications)
        ).filter(Order.id == order_id).first()

    def transition_status(
        self,
        order_id: UUID,
        new_status: OrderStatus,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> Order:
        """Transition order status with validation and audit logging"""
        order = self.db.query(Order).filter(Order.id == order_id).with_for_update().first()

        if not order:
            raise ValueError("Order not found")

        old_status = order.status

        # Validate transition
        if not self._is_valid_transition(old_status, new_status):
            raise ValueError(f"Invalid transition from {old_status} to {new_status}")

        # Require reason for Issue status
        if new_status == OrderStatus.ISSUE and not reason:
            raise ValueError("Reason is required when flagging an issue")

        # Update order status
        order.status = new_status
        order.updated_at = datetime.utcnow()

        if new_status == OrderStatus.ISSUE:
            order.issue_reason = reason

        # Create audit log
        audit_log = AuditLog(
            order_id=order.id,
            changed_by=changed_by,
            from_status=old_status.value if old_status else None,
            to_status=new_status.value,
            reason=reason,
            timestamp=datetime.utcnow()
        )
        self.db.add(audit_log)

        # Note: Teams notification should be sent via BackgroundTasks in the route handler
        # This service method doesn't send notifications directly to avoid blocking

        self.db.commit()
        self.db.refresh(order)

        return order

    def _is_valid_transition(self, from_status: OrderStatus, to_status: OrderStatus) -> bool:
        """Validate status transition"""
        valid_transitions = {
            OrderStatus.PRE_DELIVERY: [OrderStatus.IN_DELIVERY, OrderStatus.ISSUE],
            OrderStatus.IN_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.ISSUE],
            OrderStatus.ISSUE: [OrderStatus.PRE_DELIVERY],
            OrderStatus.DELIVERED: []  # Terminal state
        }

        return to_status in valid_transitions.get(from_status, [])

    def bulk_transition(
        self,
        order_ids: List[UUID],
        new_status: OrderStatus,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> List[Order]:
        """Bulk transition multiple orders"""
        orders = []
        for order_id in order_ids:
            try:
                order = self.transition_status(order_id, new_status, changed_by, reason)
                orders.append(order)
            except Exception as e:
                # Log error but continue with other orders
                continue

        return orders

    def _extract_delivery_location_from_remarks(self, order_remarks: str) -> Optional[str]:
        """
        Extract alternative delivery location from order remarks.
        Looks for patterns like "deliver to [location]" or "delivery to [location]"

        Example: "deliver to LAAH 424" -> "LAAH 424"
        """
        if not order_remarks:
            return None

        # Normalize the remarks (lowercase for case-insensitive matching)
        remarks_lower = order_remarks.lower()

        # Patterns to match: "deliver to", "delivery to", "deliver at", etc.
        patterns = [
            r'deliver\s+to\s+([^\r\n,]+)',  # "deliver to LAAH 424",
            r'delivery\s+to\s+([^\r\n,]+)',  # "delivery to LAAH 424",
            r'deliver\s+at\s+([^\r\n,]+)',   # "deliver at LAAH 424",
            # Auto-discovered patterns (from pattern analysis):
            r'deliver\s+to\s+([^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)',   # "deliver to" (found 8 times)
            r'need\s+to\s+([^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)',   # "need to" (found 6 times)
            r'located\s+at\s+([^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)',   # "located at" (found 6 times)
        ]

        for pattern in patterns:
            match = re.search(pattern, remarks_lower, re.IGNORECASE)
            if match:
                location = match.group(1).strip()
                # Remove trailing punctuation and common words
                location = re.sub(r'[.,;:]+$', '', location)
                if location:
                    return location

        return None

    def create_order_from_inflow(self, inflow_data: Dict[str, Any]) -> Order:
        """Create or update order from Inflow data"""
        order_number = inflow_data.get("orderNumber")
        if not order_number:
            raise ValueError("Order number is required")

        # Check if order is in Bryan/College Station - skip if not (FedEx shipments)
        shipping_addr_obj = inflow_data.get("shippingAddress", {})
        city = shipping_addr_obj.get("city", "").strip() if shipping_addr_obj.get("city") else ""

        # Only process orders in Bryan or College Station
        # If city is empty, still process (might be local delivery or data issue)
        if city:
            city_upper = city.upper()
            if city_upper not in ("BRYAN", "COLLEGE STATION"):
                logger.info(f"Skipping order {order_number} - not in Bryan/College Station (city: '{city}'). Order will be shipped via FedEx.")
                raise ValueError(f"Order {order_number} is not in Bryan/College Station (city: '{city}'). These orders are shipped via FedEx and not processed for delivery.")

        # Extract order remarks and shipping addresses
        order_remarks = inflow_data.get("orderRemarks", "")
        address1 = shipping_addr_obj.get("address1", "")
        address2 = shipping_addr_obj.get("address2", "")

        # Combine address1 and address2 if both exist
        shipping_address_parts = [part for part in [address1, address2] if part]
        shipping_address = " ".join(shipping_address_parts) if shipping_address_parts else address1

        building_code = None

        # PRIORITY 1: Check order remarks FIRST for building codes
        if order_remarks:
            logger.info(f"PRIORITY 1: Checking order remarks for order {order_number}: '{order_remarks[:100]}...'")
            # Try to extract building code directly from order remarks
            building_code = extract_building_code_from_location(order_remarks)
            if building_code:
                logger.info(f"✓ Found building code '{building_code}' directly in order remarks for order {order_number}")
            else:
                logger.debug(f"✗ No building code found directly in order remarks for order {order_number}")

        # PRIORITY 2: If no building code in remarks, check alternative location from remarks
        if not building_code:
            logger.debug(f"PRIORITY 2: Checking alternative location patterns in remarks for order {order_number}")
            alternative_location = self._extract_delivery_location_from_remarks(order_remarks)
            if alternative_location:
                logger.debug(f"Found alternative location in remarks: '{alternative_location}'")
                building_code = extract_building_code_from_location(alternative_location)
                if building_code:
                    logger.info(f"✓ Found building code '{building_code}' from alternative location in remarks: '{alternative_location}' for order {order_number}")
                else:
                    logger.debug(f"✗ No building code extracted from alternative location '{alternative_location}'")
            else:
                logger.debug(f"No alternative location patterns found in remarks for order {order_number}")

        # PRIORITY 3: If still no building code, check shipping addresses
        if not building_code:
            logger.info(f"PRIORITY 3: Checking shipping addresses for order {order_number}. address1='{address1}', address2='{address2}', shipping_address='{shipping_address}'")

            # First try extracting building code from address2 using location patterns (e.g., "Wehner Bldg")
            if address2:
                logger.info(f"Attempting to extract building code from address2: '{address2}'")
                building_code = extract_building_code_from_location(address2)
                if building_code:
                    logger.info(f"✓ Found building code '{building_code}' from address2 using location patterns: '{address2}'")
                else:
                    logger.info(f"✗ No building code extracted from address2: '{address2}'")

            # If no building code found, try location extraction on combined address
            if not building_code and shipping_address:
                logger.info(f"Attempting to extract building code from combined shipping address: '{shipping_address}'")
                building_code = extract_building_code_from_location(shipping_address)
                if building_code:
                    logger.info(f"✓ Found building code '{building_code}' from combined shipping address using location patterns: '{shipping_address}'")
                else:
                    logger.info(f"✗ No building code extracted from combined shipping address: '{shipping_address}'")

            # If no building code found, try ArcGIS matching on combined address
            if not building_code:
                building_code = get_building_abbreviation(None, shipping_address)
                if building_code:
                    logger.info(f"Found building code '{building_code}' from shipping address via ArcGIS: '{shipping_address}'")

            # If still no building code, try ArcGIS matching on address2
            if not building_code and address2:
                building_code = get_building_abbreviation(None, address2)
                if building_code:
                    logger.info(f"Found building code '{building_code}' from address2 via ArcGIS: '{address2}'")

        # Use building code if found, otherwise try to extract from fallback strings
        if building_code:
            delivery_location = building_code
            logger.info(f"Using building code as delivery_location for order {order_number}: '{delivery_location}'")
        else:
            # Fallback: try to extract building code from alternative location or shipping address
            # before using them as-is
            logger.debug(f"No building code found yet, attempting final extraction from fallback strings for order {order_number}")

            # Get alternative location if not already extracted
            alternative_location = self._extract_delivery_location_from_remarks(order_remarks) if order_remarks else None

            # Try to extract building code from alternative location first
            if alternative_location:
                logger.debug(f"Attempting final extraction from alternative_location: '{alternative_location}'")
                building_code = extract_building_code_from_location(alternative_location)
                if building_code:
                    delivery_location = building_code
                    logger.info(f"✓ Extracted building code '{building_code}' from alternative_location fallback for order {order_number}")
                else:
                    # Try to extract from shipping address
                    logger.debug(f"Attempting final extraction from shipping_address: '{shipping_address}'")
                    building_code = extract_building_code_from_location(shipping_address)
                    if building_code:
                        delivery_location = building_code
                        logger.info(f"✓ Extracted building code '{building_code}' from shipping_address fallback for order {order_number}")
                    else:
                        # Last resort: use alternative location or shipping address as-is
                        delivery_location = alternative_location or shipping_address
                        logger.info(f"No building code found, using raw fallback delivery_location for order {order_number}: '{delivery_location}'")
            else:
                # No alternative location, try shipping address
                logger.debug(f"No alternative location, attempting final extraction from shipping_address: '{shipping_address}'")
                building_code = extract_building_code_from_location(shipping_address)
                if building_code:
                    delivery_location = building_code
                    logger.info(f"✓ Extracted building code '{building_code}' from shipping_address fallback for order {order_number}")
                else:
                    # Last resort: use shipping address as-is
                    delivery_location = shipping_address
                    logger.info(f"No building code found, using raw shipping_address as delivery_location for order {order_number}: '{delivery_location}'")

        # Check if order exists
        existing = self.db.query(Order).filter(
            Order.inflow_order_id == order_number
        ).first()

        if existing:
            # Update existing order - only update timestamp if data actually changed
            data_changed = False

            if existing.inflow_sales_order_id != inflow_data.get("salesOrderId"):
                existing.inflow_sales_order_id = inflow_data.get("salesOrderId")
                data_changed = True

            new_recipient_name = (
                inflow_data.get("customFields", {}).get("custom4") or
                inflow_data.get("contactName")
            )
            if existing.recipient_name != new_recipient_name:
                existing.recipient_name = new_recipient_name
                data_changed = True

            if existing.recipient_contact != inflow_data.get("email"):
                existing.recipient_contact = inflow_data.get("email")
                data_changed = True

            if existing.delivery_location != delivery_location:
                existing.delivery_location = delivery_location
                data_changed = True

            if existing.po_number != inflow_data.get("poNumber"):
                existing.po_number = inflow_data.get("poNumber")
                data_changed = True

            # Only update timestamp if data actually changed
            if data_changed:
                existing.updated_at = datetime.utcnow()

            existing.inflow_data = inflow_data  # Always update to keep latest data

            # Don't overwrite manual status changes - keep existing status

            self.db.commit()
            self.db.refresh(existing)
            return existing
        else:
            # Create new order - try to use Inflow orderDate if available, otherwise use current time
            order_date = None
            if "orderDate" in inflow_data and inflow_data.get("orderDate"):
                try:
                    # Parse Inflow date string (format may vary)
                    order_date_str = inflow_data.get("orderDate")
                    if isinstance(order_date_str, str):
                        # Try common date formats
                        for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]:
                            try:
                                order_date = datetime.strptime(order_date_str.split("+")[0].split("Z")[0], fmt)
                                break
                            except ValueError:
                                continue
                except Exception as e:
                    logger.debug(f"Could not parse orderDate '{inflow_data.get('orderDate')}' for order {order_number}: {e}")

            # Use orderDate if available, otherwise use current time
            created_time = order_date if order_date else datetime.utcnow()

            order = Order(
                inflow_order_id=order_number,
                inflow_sales_order_id=inflow_data.get("salesOrderId"),
                recipient_name=(
                    inflow_data.get("customFields", {}).get("custom4") or
                    inflow_data.get("contactName")
                ),
                recipient_contact=inflow_data.get("email"),
                delivery_location=delivery_location,
                po_number=inflow_data.get("poNumber"),
                status=OrderStatus.PRE_DELIVERY,
                inflow_data=inflow_data,
                created_at=created_time,
                updated_at=created_time  # Set to same as created_at initially
            )
            self.db.add(order)
            self.db.commit()
            self.db.refresh(order)
            return order
