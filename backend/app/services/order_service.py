import re
import json
import logging
import shutil
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Union
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth

from app.models.order import Order, OrderStatus, ShippingWorkflowStatus
from app.models.audit_log import AuditLog
from app.services.audit_service import AuditService
from app.models.teams_notification import TeamsNotification, NotificationStatus
from app.services.teams_service import TeamsService
from app.utils.building_mapper import get_building_abbreviation, extract_building_code_from_location
from app.utils.exceptions import NotFoundError, ValidationError, StatusTransitionError, FileOperationError
from app.config import settings

logger = logging.getLogger(__name__)


class OrderService:
    def __init__(self, db: Session):
        self.db = db
        self.teams_service = TeamsService(db)

    def _prep_steps_complete(self, order: Order) -> bool:
        return bool(order.tagged_at and order.picklist_generated_at and order.qa_completed_at)

    def _get_incomplete_steps(self, order: Order) -> List[str]:
        """Get list of incomplete preparation steps for an order"""
        incomplete = []
        if not order.tagged_at:
            incomplete.append("asset_tagging")
        if not order.picklist_generated_at:
            incomplete.append("picklist_generation")
        if not order.qa_completed_at:
            incomplete.append("qa_checklist")
        return incomplete

    def _is_shipping_order(self, order: Order) -> bool:
        """Determine if an order is a shipping order (not local delivery)"""
        if not order.inflow_data:
            return False

        shipping_addr_obj = order.inflow_data.get("shippingAddress", {})
        city = shipping_addr_obj.get("city", "").strip() if shipping_addr_obj.get("city") else ""

        if city:
            city_upper = city.upper()
            return city_upper not in ("BRYAN", "COLLEGE STATION")

        return False  # Default to local delivery if no city specified

    def _storage_path(self, *parts: str) -> Path:
        return Path(settings.storage_root).joinpath(*parts)

    def mark_asset_tagged(
        self,
        order_id: Union[UUID, str],
        tag_ids: List[str],
        technician: Optional[str] = None
    ) -> Order:
        order_id_str = str(order_id)
        order = self.db.query(Order).filter(Order.id == order_id_str).with_for_update().first()
        if not order:
            raise NotFoundError("Order", str(order_id))

        order.tagged_at = datetime.utcnow()
        order.tagged_by = technician
        order.tag_data = {"tag_ids": tag_ids}
        order.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(order)

        # Audit logging for asset tagging
        audit_service = AuditService(self.db)
        audit_service.log_order_action(
            order_id=str(order_id),
            action="asset_tagged",
            user_id=technician or "unknown",
            description=f"Order tagged with {len(tag_ids)} asset tags",
            audit_metadata={
                "tag_ids": tag_ids,
                "tagged_by": technician
            }
        )

        return order

    def generate_picklist(
        self,
        order_id: Union[UUID, str],
        generated_by: Optional[str] = None
    ) -> Order:
        order_id_str = str(order_id)
        order = self.db.query(Order).filter(Order.id == order_id_str).with_for_update().first()
        if not order:
            raise NotFoundError("Order", str(order_id))

        if not order.tagged_at:
            raise ValidationError("Asset tagging must be completed before generating a picklist")

        if not order.inflow_data:
            raise ValidationError("Order must have inFlow data to generate picklist")

        # Enforce that the user generating the picklist is the same user who tagged the assets,
        # unless one of them is missing (legacy data)
        if order.tagged_by and generated_by and order.tagged_by != generated_by:
            raise ValidationError(
                f"Asset tagging and picklist generation must be performed by the same user. "
                f"Tagged by: {order.tagged_by}, current user: {generated_by}"
            )

        picklist_dir = self._storage_path("picklists")
        picklist_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{order.inflow_order_id or order.id}.pdf"
        destination = picklist_dir / filename

        # Generate the actual picklist PDF from inFlow data
        self._generate_picklist_pdf(order.inflow_data, str(destination))

        # Upload to SharePoint if enabled
        picklist_path = str(destination)
        try:
            from app.services.sharepoint_service import get_sharepoint_service
            sp_service = get_sharepoint_service()
            if sp_service.is_enabled:
                sp_url = sp_service.upload_pdf(str(destination), "picklists", filename)
                picklist_path = sp_url
                logger.info(f"Picklist uploaded to SharePoint: {sp_url}")
        except Exception as e:
            logger.warning(f"SharePoint upload failed for picklist, using local path: {e}")

        order.picklist_generated_at = datetime.utcnow()
        order.picklist_generated_by = generated_by
        order.picklist_path = picklist_path
        order.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(order)

        # Audit logging for picklist generation
        audit_service = AuditService(self.db)
        audit_service.log_order_action(
            order_id=str(order_id),
            action="picklist_generated",
            user_id=generated_by or "unknown",
            description=f"Picklist PDF generated",
            audit_metadata={
                "filename": filename,
                "generated_by": generated_by,
                "file_path": str(destination)
            }
        )

        # Send Order Details email to recipient (after picklist, before QA)
        self._send_order_details_email(order, generated_by)

        # Transition order to QA status (awaiting QA checklist)
        if order.status == OrderStatus.PICKED.value:
            order.status = OrderStatus.QA.value
            order.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(order)

            # Audit log for status transition to QA
            audit_service.log_order_action(
                order_id=str(order_id),
                action="status_changed",
                user_id=generated_by or "system",
                description="Order moved to QA queue after picklist generation",
                audit_metadata={
                    "from_status": OrderStatus.PICKED.value,
                    "to_status": OrderStatus.QA.value
                }
            )

        return order

    def submit_qa(
        self,
        order_id: Union[UUID, str],
        qa_data: Dict[str, Any],
        technician: Optional[str] = None
    ) -> Order:
        order_id_str = str(order_id)
        order = self.db.query(Order).filter(Order.id == order_id_str).with_for_update().first()
        if not order:
            raise NotFoundError("Order", str(order_id))

        if not order.picklist_generated_at:
            raise ValidationError("Picklist must be generated before QA can be completed")

        # Validate QA data format - must use detailed shipping QA format
        required_fields = [
            'orderNumber', 'technician', 'qaSignature', 'method',
            'verifyAssetTagSerialMatch', 'verifyOrderDetailsTemplateSent',
            'verifyPackagedProperly', 'verifyPackingSlipSerialsMatch',
            'verifyElectronicPackingSlipSaved', 'verifyBoxesLabeledCorrectly'
        ]

        missing_fields = [field for field in required_fields if field not in qa_data]
        if missing_fields:
            raise ValidationError(
                f"QA data missing required fields for detailed format: {', '.join(missing_fields)}",
                details={"missing_fields": missing_fields}
            )

        # Validate method is either "Delivery" or "Shipping"
        if qa_data.get('method') not in ['Delivery', 'Shipping']:
            raise ValidationError(
                "QA method must be either 'Delivery' or 'Shipping'",
                field="method",
                details={"provided_method": qa_data.get('method')}
            )

        # Validate boolean fields are boolean
        boolean_fields = [
            'verifyAssetTagSerialMatch', 'verifyOrderDetailsTemplateSent',
            'verifyPackagedProperly', 'verifyPackingSlipSerialsMatch',
            'verifyElectronicPackingSlipSaved', 'verifyBoxesLabeledCorrectly'
        ]
        for field in boolean_fields:
            if not isinstance(qa_data.get(field), bool):
                raise ValidationError(
                    f"QA field '{field}' must be a boolean value",
                    field=field,
                    details={"field_type": type(qa_data.get(field)).__name__}
                )

        qa_dir = self._storage_path("qa")
        qa_dir.mkdir(parents=True, exist_ok=True)
        qa_filename = f"{order.inflow_order_id or order.id}.json"
        qa_file = qa_dir / qa_filename
        qa_payload = {
            "order_id": str(order.id),
            "inflow_order_id": order.inflow_order_id,
            "submitted_at": datetime.utcnow().isoformat(),
            "submitted_by": technician,
            "responses": qa_data,
        }
        qa_file.write_text(
            json.dumps(qa_payload, indent=2, sort_keys=True),
            encoding="utf-8"
        )

        # Upload to SharePoint if enabled
        qa_path = str(qa_file)
        try:
            from app.services.sharepoint_service import get_sharepoint_service
            sp_service = get_sharepoint_service()
            if sp_service.is_enabled:
                sp_url = sp_service.upload_json(qa_payload, "qa", qa_filename)
                qa_path = sp_url
                logger.info(f"QA data uploaded to SharePoint: {sp_url}")
        except Exception as e:
            logger.warning(f"SharePoint upload failed for QA data, using local path: {e}")

        order.qa_completed_at = datetime.utcnow()
        order.qa_completed_by = technician
        order.qa_data = qa_data
        order.qa_path = qa_path
        order.qa_method = qa_data.get("method")  # "Delivery" or "Shipping"
        order.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(order)

        # Audit logging for QA completion
        audit_service = AuditService(self.db)
        audit_service.log_order_action(
            order_id=str(order_id),
            action="qa_completed",
            user_id=technician or "unknown",
            description=f"QA completed using {qa_data.get('method', 'unknown')} method",
            audit_metadata={
                "qa_method": qa_data.get("method"),
                "completed_by": technician,
                "qa_file_path": str(qa_file)
            }
        )

        return order

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
            query = query.filter(Order.status == status.value)

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

    def get_order_by_id(self, order_id: Union[UUID, str]) -> Optional[Order]:
        """Get a single order by ID"""
        order_id_str = str(order_id)
        return self.db.query(Order).filter(Order.id == order_id_str).first()

    def get_order_detail(self, order_id: Union[UUID, str]) -> Optional[Order]:
        """Get order with related data (audit logs, notifications)"""
        order_id_str = str(order_id)
        return self.db.query(Order).options(
            selectinload(Order.audit_logs),
            selectinload(Order.teams_notifications)
        ).filter(Order.id == order_id_str).first()

    def transition_status(
        self,
        order_id: Union[UUID, str],
        new_status: OrderStatus,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> Order:
        """Transition order status with validation and audit logging"""
        order_id_str = str(order_id)
        order = self.db.query(Order).filter(Order.id == order_id_str).with_for_update().first()

        if not order:
            raise NotFoundError("Order", str(order_id))

        old_status = order.status
        qa_method = order.qa_method.strip().lower() if order.qa_method else None

        # Validate transition
        if not self._is_valid_transition(old_status, new_status.value):
            raise StatusTransitionError(old_status, new_status.value)

        if new_status == OrderStatus.PRE_DELIVERY and not self._prep_steps_complete(order):
            raise ValidationError(
                "Asset tagging, picklist, and QA must be completed before Pre-Delivery",
                details={"missing_steps": self._get_incomplete_steps(order)}
            )

        if new_status in (OrderStatus.IN_DELIVERY, OrderStatus.SHIPPING):
            if not qa_method:
                raise ValidationError(
                    "QA method must be set before routing an order to Delivery or Shipping",
                    field="qa_method"
                )
            if new_status == OrderStatus.IN_DELIVERY and qa_method != "delivery":
                raise ValidationError(
                    "Order QA method must be Delivery to transition to In Delivery",
                    field="qa_method",
                    details={"qa_method": order.qa_method, "requested_status": new_status.value}
                )
            if new_status == OrderStatus.SHIPPING and qa_method != "shipping":
                raise ValidationError(
                    "Order QA method must be Shipping to transition to Shipping",
                    field="qa_method",
                    details={"qa_method": order.qa_method, "requested_status": new_status.value}
                )

        if new_status == OrderStatus.IN_DELIVERY and old_status == OrderStatus.PRE_DELIVERY:
            if not order.delivery_run_id:
                raise ValidationError("Order must be assigned to a delivery run before transitioning to In-Delivery")
            if self._is_shipping_order(order):
                raise ValidationError("Shipping orders cannot be transitioned to In-Delivery")

        if new_status == OrderStatus.SHIPPING:
            if not self._is_shipping_order(order):
                raise ValidationError("Only shipping orders (outside Bryan/College Station) can be transitioned to Shipping")

        # Require reason for Issue status
        if new_status == OrderStatus.ISSUE and not reason:
            raise ValidationError("Reason is required when flagging an issue")

        # Update order status
        order.status = new_status.value
        order.updated_at = datetime.utcnow()

        if new_status == OrderStatus.ISSUE:
            order.issue_reason = reason

        # Create audit log
        audit_log = AuditLog(
            order_id=order.id,
            changed_by=changed_by,
            from_status=old_status,
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

    def _is_valid_transition(self, from_status: str, to_status: str) -> bool:
        """Validate status transition"""
        valid_transitions = {
            OrderStatus.PICKED.value: [OrderStatus.QA.value, OrderStatus.PRE_DELIVERY.value, OrderStatus.SHIPPING.value, OrderStatus.ISSUE.value],
            OrderStatus.QA.value: [OrderStatus.PRE_DELIVERY.value, OrderStatus.SHIPPING.value, OrderStatus.ISSUE.value],
            OrderStatus.PRE_DELIVERY.value: [OrderStatus.IN_DELIVERY.value, OrderStatus.SHIPPING.value, OrderStatus.ISSUE.value],
            OrderStatus.IN_DELIVERY.value: [OrderStatus.DELIVERED.value, OrderStatus.ISSUE.value],
            OrderStatus.SHIPPING.value: [OrderStatus.DELIVERED.value, OrderStatus.ISSUE.value],
            OrderStatus.ISSUE.value: [OrderStatus.PICKED.value, OrderStatus.QA.value, OrderStatus.PRE_DELIVERY.value],
            OrderStatus.DELIVERED.value: []  # Terminal state
        }

        return to_status in valid_transitions.get(from_status, [])

    def bulk_transition(
        self,
        order_ids: List[Union[UUID, str]],
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
            raise ValidationError("Order number is required", field="orderNumber")

        # Check if order is in Bryan/College Station for delivery routing
        shipping_addr_obj = inflow_data.get("shippingAddress", {})
        city = shipping_addr_obj.get("city", "").strip() if shipping_addr_obj.get("city") else ""
        is_local_delivery = False

        # Determine if this is a local delivery (Bryan/College Station) or shipping order
        if city:
            city_upper = city.upper()
            is_local_delivery = city_upper in ("BRYAN", "COLLEGE STATION")
            if not is_local_delivery:
                logger.info(f"Order {order_number} is outside Bryan/College Station (city: '{city}'). This will be processed as a shipping order.")
        else:
            # If no city specified, assume it's local delivery (might be data issue)
            is_local_delivery = True
            logger.debug(f"No city specified for order {order_number}, assuming local delivery")

        # Extract order remarks and shipping addresses
        order_remarks = inflow_data.get("orderRemarks", "")
        address1 = shipping_addr_obj.get("address1", "")
        address2 = shipping_addr_obj.get("address2", "")

        # Combine address1 and address2 if both exist
        shipping_address_parts = [part for part in [address1, address2] if part]
        shipping_address = " ".join(shipping_address_parts) if shipping_address_parts else address1

        building_code = None

        if is_local_delivery:
            # For local deliveries, try to extract building codes
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
        else:
            # For shipping orders, use the city as delivery location
            delivery_location = city if city else shipping_address
            logger.info(f"Using city as delivery_location for shipping order {order_number}: '{delivery_location}'")

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

            new_recipient_name = inflow_data.get("contactName")
            # TODO: Add logic for more sophisticated recipient name ingestion from various sources
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
                recipient_name=inflow_data.get("contactName"),
                recipient_contact=inflow_data.get("email"),
                delivery_location=delivery_location,
                po_number=inflow_data.get("poNumber"),
                status=OrderStatus.PICKED.value,
                inflow_data=inflow_data,
                created_at=created_time,
                updated_at=created_time  # Set to same as created_at initially
            )
            self.db.add(order)
            self.db.commit()
            self.db.refresh(order)

            # Audit logging for order import
            audit_service = AuditService(self.db)
            audit_service.log_order_action(
                order_id=str(order.id),
                action="imported_from_inflow",
                user_id="system",  # Automated import
                description=f"Order imported from inFlow",
            audit_metadata={
                "inflow_order_id": order_number,
                "inflow_sales_order_id": inflow_data.get("salesOrderId"),
                "source": "inflow_webhook",
                "order_type": "shipping" if self._is_shipping_order(order) else "delivery"
            }
            )

            return order

    def _generate_picklist_pdf(self, inflow_data: Dict[str, Any], output_path: str) -> None:
        """Generate a picklist PDF from inFlow order data"""
        # Extract order data
        po_number = inflow_data.get("poNumber", "")
        pick_lines = inflow_data.get("pickLines", [])
        customer_name = inflow_data.get("contactName", "")
        email = inflow_data.get("email", "")
        order_number = inflow_data.get("orderNumber", "")
        shipping_address = inflow_data.get("shippingAddress", {}).get("address1", "")
        order_remarks = inflow_data.get('orderRemarks', '')
        lines = inflow_data.get('lines', [])

        # Filter pick lines (remove already shipped items)
        pick_lines = self._filter_picklines(inflow_data, pick_lines)

        # Create PDF
        pdf = canvas.Canvas(output_path, pagesize=letter)
        width, height = letter

        # Set PDF title
        pdf.setTitle(f"PO Number: {po_number}")
        pdf.setFont("Helvetica", 10)

        # Header
        x_offset = 50
        y_offset = height - 80

        pdf.drawString(x_offset, y_offset, f"WCDC - TechHub")
        pdf.drawRightString(width - x_offset, y_offset, f"Customer: {customer_name}")
        y_offset -= 15
        pdf.drawString(x_offset, y_offset, f"474 Agronomy Rd")
        pdf.drawRightString(width - x_offset, y_offset, f"Email: {email}")
        y_offset -= 15
        pdf.drawString(x_offset, y_offset, f"College Station, TX")
        pdf.drawRightString(width - x_offset, y_offset, f"PO Number: {po_number}")
        y_offset -= 15
        pdf.drawString(x_offset, y_offset, f"77843 USA")
        pdf.drawRightString(width - x_offset, y_offset, f"Shipping Address: {shipping_address}")
        y_offset -= 15

        # Add Recipient UIN(s) or Name(s)
        recipient_info = inflow_data.get("customFields", {}).get("custom4", "")
        pdf.drawRightString(width - x_offset, y_offset, f"Recipient UIN(s) or Name(s): {recipient_info}")
        y_offset -= 15
        pdf.line(x_offset, y_offset - 5, x_offset + 500, y_offset - 5)
        y_offset -= 25

        # Order Header
        pdf.setFont("Times-Bold", 16)
        pdf.drawString(x_offset, y_offset, f"Order Number: {order_number}")
        y_offset -= 25

        # Items section
        pdf.setFont("Times-Bold", 14)
        pdf.drawString(x_offset, y_offset, "Items:")
        y_offset -= 25
        pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)

        pdf.setFont("Helvetica", 12)

        for item in pick_lines:
            product = item.get('product', {})
            item_name = product.get('name', '').upper()
            sku = product.get('sku', "")
            quantity = item.get('quantity', {})
            standard_quantity = quantity.get('standardQuantity', "")
            serial_numbers = quantity.get('serialNumbers', [])

            # Product name and quantity
            pdf.setFont("Helvetica-Oblique", 11)
            pdf.drawString(x_offset, y_offset, f"{item_name} (SKU: {sku})")
            pdf.drawRightString(width - x_offset, y_offset, f"{standard_quantity.replace('.0', '')} item(s)")
            y_offset -= 20

            self._check_page_break(pdf, y_offset, height)

            # Serial numbers
            if serial_numbers:
                serial_text = "Serial Numbers: " + ", ".join(serial_numbers)
                max_width = width - x_offset - 50

                text_object = pdf.beginText(x_offset, y_offset)
                text_object.setFont("Helvetica-Bold", 11)

                words = serial_text.split(' ')
                current_line = ""
                for word in words:
                    if pdf.stringWidth(current_line + word, "Helvetica", 11) < max_width:
                        current_line += word + " "
                    else:
                        text_object.textLine(current_line.strip())
                        current_line = word + " "
                        y_offset -= 15
                        y_offset = self._check_page_break(pdf, y_offset, height)
                        if y_offset == height - 50:  # Page break occurred
                            text_object = pdf.beginText(x_offset, y_offset)
                            text_object.setFont("Helvetica-Bold", 11)

                if current_line:
                    text_object.textLine(current_line.strip())
                    y_offset -= 20

                pdf.drawText(text_object)

            pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)
            y_offset -= 5

        # Order Remarks
        y_offset -= 20
        y_offset = self._check_page_break(pdf, y_offset, height)

        pdf.setFont("Times-Bold", 14)
        pdf.drawString(x_offset, y_offset, "Order Remarks:")
        y_offset -= 20
        pdf.line(x_offset, y_offset + 15, x_offset + 500, y_offset + 15)

        y_offset = self._check_page_break(pdf, y_offset, height)

        pdf.setFont("Helvetica-Bold", 11)
        wrapped_lines = self._wrap_text(order_remarks, 500, "Helvetica-Bold", 11)
        for line in wrapped_lines:
            if y_offset < 60:
                pdf.showPage()
                y_offset = height - 50
                pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(x_offset, y_offset, line)
            y_offset -= 14

        # Signature line
        pdf.setFont("Helvetica", 12)
        pdf.drawString(x_offset, 70, "Customer Signature:")
        pdf.line(x_offset, 60, x_offset + 500, 60)

        pdf.save()
        logger.info(f"Picklist PDF generated: {output_path}")

    def _filter_picklines(self, inflow_data: Dict[str, Any], pick_lines: List[Dict]) -> List[Dict]:
        """Filter pick lines to show only unshipped items"""
        pack_lines = inflow_data.get("packLines", [])

        # Build summary of shipped quantities & serials
        shipped_items = {}
        for pack in pack_lines:
            pid = pack["productId"]
            qty = float(pack["quantity"]["standardQuantity"])
            serials = pack["quantity"].get("serialNumbers", [])

            if pid not in shipped_items:
                shipped_items[pid] = {
                    "quantity": 0.0,
                    "serialNumbers": set()
                }

            shipped_items[pid]["quantity"] += qty
            shipped_items[pid]["serialNumbers"].update(serials)

        # Track picked items
        tracked_orders = {}
        for pick in pick_lines:
            pid = pick["productId"]
            qty = float(pick["quantity"]["standardQuantity"])
            serials = pick["quantity"].get("serialNumbers", [])

            if pid not in tracked_orders:
                tracked_orders[pid] = {
                    **pick,
                    "quantity": {
                        "standardQuantity": qty,
                        "serialNumbers": list(serials)
                    }
                }
            else:
                tracked_orders[pid]["quantity"]["standardQuantity"] += qty
                tracked_orders[pid]["quantity"]["serialNumbers"].extend(serials)

        # Subtract shipped from picked to get unshipped
        unshipped = []
        for pid, pick in tracked_orders.items():
            picked_qty = pick["quantity"]["standardQuantity"]
            picked_serials = pick["quantity"].get("serialNumbers", [])
            track_serials = pick["product"].get("trackSerials", False)

            shipped = shipped_items.get(pid, {"quantity": 0.0, "serialNumbers": set()})
            shipped_qty = shipped["quantity"]
            shipped_serials = shipped["serialNumbers"]

            remaining_qty = picked_qty - shipped_qty

            if remaining_qty <= 0:
                continue  # everything shipped

            unshipped_entry = {
                **pick,
                "quantity": {
                    "standardQuantity": str(remaining_qty),
                    "serialNumbers": []
                }
            }

            if track_serials:
                # Remove shipped serials from picked serials
                remaining_serials = [sn for sn in picked_serials if sn not in shipped_serials]
                unshipped_entry["quantity"]["serialNumbers"] = remaining_serials
                # Adjust quantity to number of serials remaining
                unshipped_entry["quantity"]["standardQuantity"] = str(len(remaining_serials))

            unshipped.append(unshipped_entry)

        return unshipped

    def _check_page_break(self, pdf: canvas.Canvas, y_offset: int, height: int) -> int:
        """Check if page break is needed and return updated y_offset"""
        if y_offset < 60:
            pdf.showPage()
            return height - 50
        return y_offset

    def _wrap_text(self, text: str, max_width: int, font_name: str, font_size: int) -> List[str]:
        """Wrap text to fit within max_width, respecting explicit newlines"""
        if not text:
            return []

        # First split on explicit newlines to respect intentional line breaks
        paragraphs = str(text).split('\n')
        lines = []

        for paragraph in paragraphs:
            if not paragraph.strip():
                # Preserve blank lines
                lines.append("")
                continue

            words = paragraph.split()
            line = ""

            for word in words:
                test_line = f"{line} {word}".strip()
                test_width = stringWidth(test_line, font_name, font_size)
                if test_width <= max_width:
                    line = test_line
                else:
                    if line:
                        lines.append(line)
                    line = word

            if line:
                lines.append(line)

        return lines

    def _send_order_details_email(self, order: Order, generated_by: Optional[str] = None) -> None:
        """
        Send Order Details PDF email to recipient after picklist generation.

        Flow:
        1. Check SharePoint for existing PDF
        2. If not found, generate PDF and upload to SharePoint
        3. Send email with PDF

        This runs as a best-effort operation - errors are logged but don't fail the picklist generation.
        """
        from app.services.pdf_service import pdf_service
        from app.services.email_service import email_service
        from app.config import settings

        # Get recipient email
        recipient_email = order.recipient_contact
        order_number = order.inflow_order_id
        pdf_filename = f"{order_number}.pdf"

        try:
            if not order.inflow_data:
                logger.warning(f"No inFlow data for order {order_number}, skipping Order Details generation")
                return

            pdf_bytes = None
            order_details_path = None

            # Step 1: Check SharePoint first for existing PDF
            try:
                from app.services.sharepoint_service import get_sharepoint_service
                sp_service = get_sharepoint_service()

                if sp_service.is_enabled:
                    logger.info(f"Checking SharePoint for existing Order Details PDF: {pdf_filename}")
                    existing_pdf = sp_service.download_file("order-details", pdf_filename)

                    if existing_pdf:
                        logger.info(f"Found existing Order Details PDF in SharePoint: {pdf_filename}")
                        pdf_bytes = existing_pdf
                        order_details_path = sp_service.get_file_url("order-details", pdf_filename)
            except Exception as e:
                logger.warning(f"Error checking SharePoint for existing PDF: {e}")

            # Step 2: If not found in SharePoint, generate and upload
            if pdf_bytes is None:
                logger.info(f"Generating Order Details PDF for order {order_number}")
                pdf_bytes = pdf_service.generate_order_details_pdf(order.inflow_data)

                # Save locally first
                order_details_dir = self._storage_path("order_details")
                order_details_dir.mkdir(parents=True, exist_ok=True)
                pdf_path = order_details_dir / pdf_filename
                pdf_path.write_bytes(pdf_bytes)
                logger.info(f"Order Details PDF saved to {pdf_path}")
                order_details_path = str(pdf_path)

                # Upload to SharePoint if enabled
                try:
                    from app.services.sharepoint_service import get_sharepoint_service
                    sp_service = get_sharepoint_service()
                    if sp_service.is_enabled:
                        sp_url = sp_service.upload_file(pdf_bytes, "order-details", pdf_filename)
                        order_details_path = sp_url
                        logger.info(f"Order Details PDF uploaded to SharePoint: {sp_url}")
                except Exception as e:
                    logger.warning(f"SharePoint upload failed for Order Details, using local path: {e}")

            # Update order with Order Details path
            order.order_details_path = order_details_path
            order.order_details_generated_at = datetime.utcnow()
            self.db.commit()

            # Check if email sending is configured
            if not email_service.is_configured():
                logger.debug(f"Power Automate email not configured, skipping Order Details email for order {order_number}")
                return

            if not recipient_email:
                logger.warning(f"No recipient email for order {order_number}, skipping Order Details email")
                return

            # Step 3: Send email with PDF
            customer_name = order.recipient_name or "Customer"

            success = email_service.send_order_details_email(
                to_address=recipient_email,
                order_number=order_number,
                customer_name=customer_name,
                pdf_content=pdf_bytes
            )

            if success:
                logger.info(f"Order Details email sent to {recipient_email} for order {order_number}")

                # Audit log the email
                audit_service = AuditService(self.db)
                audit_service.log_order_action(
                    order_id=str(order.id),
                    action="order_details_email_sent",
                    user_id=generated_by or "system",
                    description=f"Order Details PDF emailed to {recipient_email}",
                    audit_metadata={
                        "recipient_email": recipient_email,
                        "order_number": order_number,
                        "pdf_path": order_details_path
                    }
                )
            else:
                logger.error(f"Failed to send Order Details email to {recipient_email} for order {order_number}")

        except Exception as e:
            # Log error but don't fail the picklist generation
            logger.error(f"Error generating/sending Order Details for order {order.inflow_order_id}: {e}")

    def transition_shipping_workflow(
        self,
        order_id: Union[UUID, str],
        new_status: ShippingWorkflowStatus,
        carrier_name: Optional[str] = None,
        tracking_number: Optional[str] = None,
        updated_by: Optional[str] = None
    ) -> Order:
        """Transition shipping workflow status with validation"""
        order_id_str = str(order_id)
        order = self.db.query(Order).filter(Order.id == order_id_str).with_for_update().first()
        if not order:
            raise NotFoundError("Order", str(order_id))

        if order.status != OrderStatus.SHIPPING.value:
            raise ValidationError("Order must be in Shipping status to update shipping workflow")

        # Validate blocking requirements
        current_status = order.shipping_workflow_status or ShippingWorkflowStatus.WORK_AREA.value

        if new_status == ShippingWorkflowStatus.DOCK and current_status != ShippingWorkflowStatus.WORK_AREA.value:
            raise ValidationError("Order must be in Work Area before moving to Dock")

        if new_status == ShippingWorkflowStatus.SHIPPED and current_status != ShippingWorkflowStatus.DOCK.value:
            raise ValidationError("Order must be at Dock before marking as Shipped")

        # Update fields
        order.shipping_workflow_status = new_status.value
        order.shipping_workflow_status_updated_at = datetime.utcnow()
        order.shipping_workflow_status_updated_by = updated_by
        order.updated_at = datetime.utcnow()

        if new_status == ShippingWorkflowStatus.SHIPPED:
            order.shipped_to_carrier_at = datetime.utcnow()
            order.shipped_to_carrier_by = updated_by
            if carrier_name:
                order.carrier_name = carrier_name
            if tracking_number:
                order.tracking_number = tracking_number

            # Auto-transition to Delivered status when shipped
            order.status = OrderStatus.DELIVERED.value

        self.db.commit()
        self.db.refresh(order)

        # Audit logging
        audit_service = AuditService(self.db)
        audit_service.log_order_action(
            order_id=str(order_id),
            action=f"shipping_workflow_{new_status.value}",
            user_id=updated_by or "unknown",
            description=f"Shipping workflow updated to {new_status.display_name}",
            audit_metadata={
                "carrier_name": carrier_name,
                "tracking_number": tracking_number
            }
        )

        return order

    def generate_bundled_documents(self, order_id: Union[UUID, str], signature_data: dict) -> str:
        """Generate bundled documents: create folder with signed picklist and QA form"""
        order_id_str = str(order_id)
        order = self.db.query(Order).filter(Order.id == order_id_str).first()
        if not order:
            raise NotFoundError("Order", str(order_id))

        if not order.picklist_path or not order.qa_path:
            raise ValidationError(
                "Order missing picklist or QA data",
                details={
                    "has_picklist": bool(order.picklist_path),
                    "has_qa": bool(order.qa_path)
                }
            )

        # Create completed documents directory structure
        completed_dir = self._storage_path("completed")
        completed_dir.mkdir(parents=True, exist_ok=True)

        order_dir = completed_dir / (order.inflow_order_id or str(order.id))
        order_dir.mkdir(parents=True, exist_ok=True)


        # Generate individual PDFs
        signed_picklist_path = self._apply_signature_to_pdf(
            order.picklist_path, signature_data
        )


        qa_pdf_path = self._generate_qa_pdf(order.qa_data, order)


        # Copy files to completed folder
        import shutil

        signed_picklist_dest = order_dir / "signed_picklist.pdf"
        qa_form_dest = order_dir / "qa_form.pdf"


        shutil.copy2(signed_picklist_path, signed_picklist_dest)
        shutil.copy2(qa_pdf_path, qa_form_dest)

        # Clean up temporary files
        Path(signed_picklist_path).unlink(missing_ok=True)
        Path(qa_pdf_path).unlink(missing_ok=True)


        return str(order_dir)

    def _apply_signature_to_pdf(self, pdf_path: str, signature_data: dict) -> str:
        """Apply signature overlay to existing PDF"""
        from pypdf import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.utils import ImageReader
        import base64
        import io
        from PIL import Image
        import tempfile
        import os

        # Extract signature data
        signature_b64 = signature_data.get('signature_image', '')
        page_number = signature_data.get('page_number', 1)
        position = signature_data.get('position', {'x': 50, 'y': 60})  # Default position

        if not signature_b64:
            # No signature provided, return original PDF
            return pdf_path

        # Decode base64 signature image
        try:
            signature_data_bytes = base64.b64decode(signature_b64.split(',')[1])  # Remove data:image/png;base64, prefix
            signature_image = Image.open(io.BytesIO(signature_data_bytes))

            # Ensure we keep the image in a mode reportlab can handle (RGB or RGBA)
            # reportlab supports RGBA with mask='auto'
        except Exception as e:
            logger.error(f"Error processing signature image: {e}")
            return pdf_path

        # Read the original PDF
        reader = PdfReader(pdf_path)

        # Validate page number
        if page_number < 1 or page_number > len(reader.pages):
            page_number = len(reader.pages)  # Default to last page

        # Get page dimensions (assuming all pages have same size for simplicity)
        page = reader.pages[page_number - 1]
        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)

        # Create overlay PDF with signature
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as overlay_file:
            overlay_path = overlay_file.name

        c = canvas.Canvas(overlay_path, pagesize=(page_width, page_height))

        # Frontend sends a canvas capture that matches the PDF aspect ratio and covers the whole page
        # So we draw it filling the page dimensions.
        # mask='auto' ensures transparency from the alpha channel is respected.
        c.drawImage(
            ImageReader(signature_image),
            0,
            0,
            width=page_width,
            height=page_height,
            mask='auto'
        )
        c.save()

        # Merge overlay with original PDF
        writer = PdfWriter()

        # Add pages from original PDF, overlaying signature on target page
        for i, page in enumerate(reader.pages):
            if i == page_number - 1:  # 0-indexed
                # Read the overlay PDF
                overlay_reader = PdfReader(overlay_path)
                overlay_page = overlay_reader.pages[0]

                # Merge overlay onto the page
                page.merge_page(overlay_page)

            writer.add_page(page)

        # Save signed PDF
        signed_path = pdf_path.replace('.pdf', '-signed.pdf')
        with open(signed_path, 'wb') as f:
            writer.write(f)

        # Clean up temporary overlay file
        try:
            os.unlink(overlay_path)
        except:
            pass

        return signed_path

    def _generate_qa_pdf(self, qa_data: dict, order: Order) -> str:
        """Generate QA checklist PDF from JSON data"""
        qa_dir = self._storage_path("temp")
        qa_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{order.inflow_order_id or order.id}-qa.pdf"
        output_path = qa_dir / filename

        pdf = canvas.Canvas(str(output_path), pagesize=letter)
        width, height = letter

        # Header
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(50, height - 50, "Quality Assurance Checklist")

        # Order details
        pdf.setFont("Helvetica", 12)
        y_pos = height - 80
        pdf.drawString(50, y_pos, f"Order: {order.inflow_order_id}")
        pdf.drawString(50, y_pos - 20, f"Recipient: {order.recipient_name or 'Unknown'}")
        pdf.drawString(50, y_pos - 40, f"Method: {qa_data.get('method', 'Unknown')}")
        pdf.drawString(50, y_pos - 60, f"Technician: {qa_data.get('technician', 'Unknown')}")
        pdf.drawString(50, y_pos - 80, f"QA Signature: {qa_data.get('qaSignature', 'Unknown')}")

        # Checklist items
        y_pos -= 120
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(50, y_pos, "Quality Assurance Checklist:")
        y_pos -= 30

        pdf.setFont("Helvetica", 11)

        # Handle both old and new QA formats
        if "items" in qa_data:
            # Old format: items array with id, label, passed
            checklist_items = qa_data["items"]
            for item in checklist_items:
                status = "PASS" if item.get("passed", False) else "FAIL"
                label = item.get("label", item.get("id", "Unknown"))
                pdf.drawString(70, y_pos, f"[{status}] {label}")
                y_pos -= 20
        else:
            # New detailed format: individual boolean fields
            checklist_items = [
                ("verifyAssetTagSerialMatch", "Asset tags applied and serial numbers match on device, sticker, and pick list"),
                ("verifyOrderDetailsTemplateSent", "Order details template sent to customer before delivery"),
                ("verifyPackagedProperly", "System and all materials packaged properly"),
                ("verifyPackingSlipSerialsMatch", "Packing slip and picked items serial numbers match"),
                ("verifyElectronicPackingSlipSaved", "Electronic packing slip saved on shipping/receiving computer"),
                ("verifyBoxesLabeledCorrectly", "Boxes labeled with correct order details and shipping labels marked out")
            ]

            for field, description in checklist_items:
                status = "PASS" if qa_data.get(field, False) else "FAIL"
                pdf.drawString(70, y_pos, f"[{status}] {description}")
                y_pos -= 20

        # Signature line
        y_pos -= 40
        pdf.setFont("Helvetica", 12)
        pdf.drawString(50, y_pos, "QA Technician Signature:")
        pdf.line(50, y_pos - 10, width - 50, y_pos - 10)
        pdf.drawString(50, y_pos - 25, qa_data.get("qaSignature", ""))

        pdf.save()
        return str(output_path)

    def _bundle_pdfs(self, pdf_paths: list[str], output_path: str) -> None:
        """Combine multiple PDFs into single document"""

        from pypdf import PdfMerger

        merger = PdfMerger()
        for pdf_path in pdf_paths:
            merger.append(pdf_path)


        merger.write(output_path)
        merger.close()
