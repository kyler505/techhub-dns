from flask import Blueprint, request, jsonify, abort, send_file
from flask_socketio import emit
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from pathlib import Path
import threading

from app.database import get_db
from app.services.order_service import OrderService
from app.services.inflow_service import InflowService
from app.services.tag_request_service import TagRequestService

from app.schemas.order import (
    OrderResponse,
    OrderDetailResponse,
    OrderStatusUpdate,
    BulkStatusUpdate,
    OrderUpdate,
    AssetTagUpdate,
    PicklistGenerationRequest,
    QASubmission,
    SignatureData,
    ShippingWorkflowUpdateRequest,
    ShippingWorkflowResponse,
    PickStatus
)
from app.models.order import OrderStatus
from app.models.order import Order
from app.schemas.audit import AuditLogResponse
from app.utils.exceptions import DNSApiError, NotFoundError, ValidationError
from app.api.auth_middleware import get_current_user_email

bp = Blueprint('orders', __name__)
bp.strict_slashes = False

# Simple in-memory broadcaster for SocketIO clients
_order_clients = set()


def _broadcast_orders_sync(db_session: Session = None):
    """Send current orders to all connected clients (sync version)."""
    if db_session is None:
        from app.database import get_db_session
        db_session = get_db_session()

    try:
        service = OrderService(db_session)
        orders, _ = service.get_orders(limit=1000)
        payload = []
        for order in orders:
            payload.append({
                "id": str(order.id),
                "inflow_order_id": order.inflow_order_id,
                "recipient_name": order.recipient_name,
                "status": order.status,
                "updated_at": order.updated_at.isoformat() if order.updated_at else None,
                "delivery_location": order.delivery_location,
                "assigned_deliverer": order.assigned_deliverer
            })

        # Emit via SocketIO to all connected clients
        # Emit via SocketIO to all connected clients in 'orders' room
        try:
            from app.main import socketio
            socketio.emit('orders_update', {"type": "orders_update", "data": payload}, room='orders')
            # Keeping broadcast to all for backward compatibility if needed, but 'room' is preferred
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to broadcast orders: {e}")
    finally:
        if db_session is not None:
            db_session.close()


@bp.route("/", methods=["GET"])
def get_orders():
    """Get orders with filters and pagination"""
    status = request.args.get('status')
    search = request.args.get('search')
    skip = request.args.get('skip', 0, type=int)
    limit = request.args.get('limit', 100, type=int)

    # Validate limit
    limit = max(1, min(limit, 1000))
    skip = max(0, skip)

    # Convert status string to enum if provided
    status_enum = None
    if status:
        try:
            status_enum = OrderStatus(status)
        except ValueError:
            pass

    with get_db() as db:
        service = OrderService(db)
        inflow_service = InflowService()
        orders, total = service.get_orders(status=status_enum, search=search, skip=skip, limit=limit)

        # Enrich orders with pick_status for Pre-Delivery queue visibility
        result = []
        for o in orders:
            order_dict = OrderResponse.model_validate(o).model_dump()

            # Compute pick_status from inflow_data if available
            if o.inflow_data:
                pick_status_data = inflow_service.get_pick_status(o.inflow_data)
                order_dict['pick_status'] = pick_status_data

            result.append(order_dict)

        return jsonify(result)


@bp.route("/tag-request/candidates", methods=["GET"])
def get_tag_request_candidates():
    """Get picked orders that still need a tag request batch."""
    limit = request.args.get("limit", default=200, type=int)
    limit = max(1, min(limit, 1000))

    search = (request.args.get("search") or "").strip()

    with get_db() as db:
        query = (
            db.query(Order)
            .filter(Order.status == OrderStatus.PICKED.value)
            .filter(Order.tagged_at.is_(None))
        )

        if search:
            like = f"%{search}%"
            query = query.filter(
                or_(
                    Order.inflow_order_id.ilike(like),
                    Order.recipient_name.ilike(like),
                )
            )

        # JSON tag_data filtering is handled in Python for cross-DB compatibility.
        candidates: list[Order] = (
            query.order_by(Order.updated_at.desc()).limit(1000).all()
        )

        needing_request: list[dict] = []
        for order in candidates:
            tag_data = order.tag_data or {}
            sent_at = tag_data.get("canopyorders_request_sent_at") or tag_data.get("tag_request_sent_at")
            if sent_at or tag_data.get("tag_request_status") == "sent":
                continue
            needing_request.append(OrderResponse.model_validate(order).model_dump())
            if len(needing_request) >= limit:
                break

        return jsonify(needing_request)


@bp.route("/<uuid:order_id>", methods=["GET"])
def get_order(order_id):
    """Get order detail with audit logs and notifications"""
    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_detail(order_id)
        if not order:
            abort(404, description="Order not found")
        response_data = OrderDetailResponse.model_validate(order).model_dump()
        if order.inflow_data:
            inflow_service = InflowService()
            response_data["asset_tag_serials"] = inflow_service.get_asset_tag_serials(order.inflow_data)

        return jsonify(response_data)


@bp.route("/<uuid:order_id>", methods=["PATCH"])
def update_order(order_id):
    """Update order fields"""
    data = request.get_json()

    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_detail(order_id)
        if not order:
            abort(404, description="Order not found")

        update = OrderUpdate(**data)
        for field, value in update.model_dump(exclude_unset=True).items():
            setattr(order, field, value)

        db.commit()
        db.refresh(order)
        return jsonify(OrderResponse.model_validate(order).model_dump())


@bp.route("/<uuid:order_id>/status", methods=["PATCH"])
def update_order_status(order_id):
    """Transition order status"""
    data = request.get_json()
    changed_by = request.args.get('changed_by')

    with get_db() as db:
        service = OrderService(db)
        status_update = OrderStatusUpdate(**data)
        order = service.transition_status(
            order_id=order_id,
            new_status=status_update.status,
            changed_by=changed_by,
            reason=status_update.reason
        )

        # Send notifications based on new status
        if status_update.status == OrderStatus.IN_DELIVERY:
            from app.services.teams_recipient_service import teams_recipient_service
            teams_recipient_service.notify_orders_in_delivery([order])


        # Broadcast order update via SocketIO
        threading.Thread(target=_broadcast_orders_sync).start()

        return jsonify(OrderResponse.model_validate(order).model_dump())


@bp.route("/bulk-transition", methods=["POST"])
def bulk_transition_status():
    """Bulk transition multiple orders"""
    data = request.get_json()
    changed_by = request.args.get('changed_by')

    with get_db() as db:
        service = OrderService(db)
        bulk_update = BulkStatusUpdate(**data)
        orders = service.bulk_transition(
            order_ids=bulk_update.order_ids,
            new_status=bulk_update.status,
            changed_by=changed_by,
            reason=bulk_update.reason
        )

        # Trigger Teams notifications for bulk transitions to In Delivery
        if bulk_update.status == OrderStatus.IN_DELIVERY:
            from app.services.teams_recipient_service import teams_recipient_service
            teams_recipient_service.notify_orders_in_delivery(orders)

        # Broadcast order updates via SocketIO
        threading.Thread(target=_broadcast_orders_sync).start()

        return jsonify([OrderResponse.model_validate(o).model_dump() for o in orders])


@bp.route("/<uuid:order_id>/audit", methods=["GET"])
def get_order_audit(order_id):
    """Get audit log for an order"""
    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_detail(order_id)
        if not order:
            abort(404, description="Order not found")

        return jsonify([AuditLogResponse.model_validate(log).model_dump(mode="json") for log in order.audit_logs])


@bp.route("/<uuid:order_id>/tag/request", methods=["POST"])
def request_order_tags(order_id):
    """Request asset tags for an order via WebDAV and Teams notification"""
    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_detail(order_id)
        if not order:
            abort(404, description="Order not found")

        if not order.inflow_data:
            abort(400, description="Order missing inflow_data; cannot request tags")

        if not order.inflow_order_id:
            abort(400, description="Order missing inflow_order_id; cannot request tags")

        # Get asset tag serials
        inflow_service = InflowService()
        serials_payload = inflow_service.get_asset_tag_serials(order.inflow_data)
        if not serials_payload:
            abort(400, description="No asset-taggable items found in this order")

        # Get technician from auth context
        current_user = get_current_user_email()
        technician = current_user if current_user != "system" else "Technician"

        # Call tag request service (async orchestration)
        import asyncio
        tag_service = TagRequestService()
        try:
            result = asyncio.run(tag_service.process_tag_request(
                order_number=order.inflow_order_id,
                technician=technician,
                serials_payload=serials_payload
            ))
        except Exception as error:
            abort(500, description=f"Failed to process tag request: {error}")

        if result["status"] == "success":
            # Update order tag_data with request metadata
            tag_data = dict(order.tag_data or {})
            tag_data.update({
                "tag_request_sent_at": result["sent_at"],
                "tag_request_filename": result["filename"],
                "tag_request_status": "sent"
            })
            order.tag_data = tag_data
            db.commit()
            db.refresh(order)
            return jsonify(OrderResponse.model_validate(order).model_dump())
        else:
            abort(500, description=result.get("message", "Failed to process tag request"))


@bp.route("/<uuid:order_id>/tag", methods=["POST"])
def tag_order(order_id):
    """Mock asset tagging step"""
    data = request.get_json()

    with get_db() as db:
        service = OrderService(db)
        tag_update = AssetTagUpdate(**data)

        # Auto-assign technician from auth context, fallback to payload for tests/systems
        current_user = get_current_user_email()
        technician = current_user if current_user != "system" else tag_update.technician

        order = service.mark_asset_tagged(
            order_id=order_id,
            tag_ids=tag_update.tag_ids,
            technician=technician
        )
        return jsonify(OrderResponse.model_validate(order).model_dump())


@bp.route("/<uuid:order_id>/picklist", methods=["POST"])
def generate_picklist(order_id):
    """Generate a picklist PDF for the order"""
    data = request.get_json()

    with get_db() as db:
        service = OrderService(db)
        gen_request = PicklistGenerationRequest(**data)

        # Auto-assign generator from auth context
        current_user = get_current_user_email()
        generated_by = current_user if current_user != "system" else gen_request.generated_by

        order = service.generate_picklist(
            order_id=order_id,
            generated_by=generated_by
        )
        return jsonify(OrderResponse.model_validate(order).model_dump())


@bp.route("/<uuid:order_id>/qa", methods=["POST"])
def submit_qa(order_id):
    """Submit QA checklist for an order"""
    data = request.get_json()

    with get_db() as db:
        service = OrderService(db)
        submission = QASubmission(**data)

        # Auto-assign technician from auth context
        current_user = get_current_user_email()
        technician = current_user if current_user != "system" else submission.technician

        order = service.submit_qa(
            order_id=order_id,
            qa_data=submission.responses,
            technician=technician
        )





        # Broadcast order update via SocketIO
        threading.Thread(target=_broadcast_orders_sync).start()

        return jsonify(OrderResponse.model_validate(order).model_dump())


@bp.route("/<uuid:order_id>/picklist", methods=["GET"])
def get_picklist(order_id):
    """Download generated picklist PDF (from local storage or SharePoint)"""
    from io import BytesIO

    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_detail(order_id)
        if not order:
            abort(404, description="Order not found")
        if not order.picklist_path:
            abort(404, description="Picklist not generated")

        picklist_path = order.picklist_path

        # Check if this is a SharePoint URL
        if picklist_path.startswith("http"):
            # Download from SharePoint
            try:
                from app.services.sharepoint_service import get_sharepoint_service
                sp_service = get_sharepoint_service()

                # Extract filename from the path stored in order
                # The path format is the SharePoint web URL
                filename = f"{order.inflow_order_id}.pdf"

                # Download the file from SharePoint
                pdf_bytes = sp_service.download_file("picklists", filename)
                if not pdf_bytes:
                    abort(404, description="Picklist file not found in SharePoint")

                pdf_stream = BytesIO(pdf_bytes)
                pdf_stream.seek(0)

                return send_file(
                    pdf_stream,
                    mimetype="application/pdf",
                    as_attachment=False,
                    download_name=filename
                )
            except Exception as e:
                import logging
                logging.error(f"Failed to download picklist from SharePoint: {e}")
                abort(500, description=f"Failed to download from SharePoint: {str(e)}")
        else:
            # Local file path
            path = Path(picklist_path)
            if not path.exists():
                abort(404, description="Picklist file missing")

            return send_file(path.resolve(), mimetype="application/pdf", download_name=path.name)





@bp.route("/<uuid:order_id>/fulfill", methods=["POST"])
def fulfill_order(order_id):
    """Mark an order as fulfilled in Inflow (best-effort)."""
    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_detail(order_id)
        if not order:
            abort(404, description="Order not found")
        if not order.inflow_sales_order_id:
            abort(400, description="Order missing inflow_sales_order_id")

        inflow_service = InflowService()
        result = inflow_service.fulfill_sales_order_sync(
            order.inflow_sales_order_id,
            db=db,
            user_id="system"
        )
        return jsonify({"success": True, "result": result})


@bp.route("/<uuid:order_id>/sign", methods=["POST"])
def sign_order(order_id):
    """Complete order signing, generate bundled documents, and transition to Delivered status"""
    data = request.get_json()

    with get_db() as db:
        service = OrderService(db)

        order = service.get_order_by_id(order_id)
        if not order:
            raise NotFoundError("Order", str(order_id))

        if order.status != OrderStatus.IN_DELIVERY.value:
            raise ValidationError(
                f"Order must be in In Delivery status to sign. Current status: {order.status}",
                details={
                    "current_status": order.status,
                    "required_status": OrderStatus.IN_DELIVERY.value
                }
            )

        signature_data = SignatureData(**data)
        bundled_path = service.generate_bundled_documents(
            order_id=order_id,
            signature_data=signature_data.model_dump()
        )

        from datetime import datetime
        order = service.transition_status(
            order_id=order_id,
            new_status=OrderStatus.DELIVERED,
            changed_by="system"
        )

        order.signature_captured_at = datetime.utcnow()
        order.signed_picklist_path = bundled_path
        order.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(order)



        # Broadcast order update via SocketIO
        threading.Thread(target=_broadcast_orders_sync).start()

        return jsonify({
            "success": True,
            "message": "Order signed and bundled documents generated",
            "bundled_document_path": bundled_path
        })


@bp.route("/<uuid:order_id>/shipping-workflow", methods=["PATCH"])
def update_shipping_workflow(order_id):
    """Update shipping workflow status for an order"""
    data = request.get_json()

    with get_db() as db:
        service = OrderService(db)
        req = ShippingWorkflowUpdateRequest(**data)
        order = service.transition_shipping_workflow(
            order_id=order_id,
            new_status=req.status,
            carrier_name=req.carrier_name,
            tracking_number=req.tracking_number,
            updated_by=req.updated_by
        )

        # Broadcast order update via SocketIO
        threading.Thread(target=_broadcast_orders_sync).start()

        return jsonify(OrderResponse.model_validate(order).model_dump())


@bp.route("/<uuid:order_id>/shipping-workflow", methods=["GET"])
def get_shipping_workflow(order_id):
    """Get shipping workflow status for an order"""
    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_by_id(order_id)
        if not order:
            abort(404, description="Order not found")

        response = ShippingWorkflowResponse(
            shipping_workflow_status=order.shipping_workflow_status,
            shipping_workflow_status_updated_at=order.shipping_workflow_status_updated_at,
            shipping_workflow_status_updated_by=order.shipping_workflow_status_updated_by,
            shipped_to_carrier_at=order.shipped_to_carrier_at,
            shipped_to_carrier_by=order.shipped_to_carrier_by,
            carrier_name=order.carrier_name,
            tracking_number=order.tracking_number
        )
        return jsonify(response.model_dump())


@bp.route("/<uuid:order_id>/order-details.pdf", methods=["GET"])
def get_order_details_pdf(order_id):
    """Generate and download Order Details PDF"""
    from app.services.pdf_service import pdf_service
    from io import BytesIO

    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_by_id(order_id)
        if not order:
            abort(404, description="Order not found")

        # Get fresh inFlow data
        inflow_service = InflowService()
        inflow_data = inflow_service.get_order_by_id_sync(order.inflow_sales_order_id)

        if not inflow_data:
            abort(404, description="Order not found in inFlow")

        # Generate PDF
        try:
            pdf_bytes = pdf_service.generate_order_details_pdf(inflow_data)
            pdf_stream = BytesIO(pdf_bytes)
            pdf_stream.seek(0)

            filename = f"OrderDetails_{order.inflow_order_id}.pdf"
            return send_file(
                pdf_stream,
                mimetype="application/pdf",
                as_attachment=False,
                download_name=filename
            )
        except Exception as e:
            import logging
            logging.error(f"Failed to generate Order Details PDF: {e}")
            abort(500, description="Failed to generate PDF")


@bp.route("/<uuid:order_id>/send-order-details", methods=["POST"])
def send_order_details_email(order_id):
    """Generate Order Details PDF and email to recipient"""
    from app.services.pdf_service import pdf_service
    from app.services.email_service import email_service

    with get_db() as db:
        service = OrderService(db)
        order = service.get_order_by_id(order_id)
        if not order:
            abort(404, description="Order not found")

        # Get fresh inFlow data
        inflow_service = InflowService()
        inflow_data = inflow_service.get_order_by_id_sync(order.inflow_sales_order_id)

        if not inflow_data:
            abort(404, description="Order not found in inFlow")

        # Get recipient email
        recipient_email = inflow_data.get("email") or order.recipient_contact
        if not recipient_email:
            abort(400, description="No recipient email address available")

        # Generate PDF
        try:
            pdf_bytes = pdf_service.generate_order_details_pdf(inflow_data)
        except Exception as e:
            import logging
            logging.error(f"Failed to generate Order Details PDF: {e}")
            abort(500, description="Failed to generate PDF")

        # Send email
        customer_name = inflow_data.get("contactName") or order.recipient_name
        order_number = order.inflow_order_id

        success = email_service.send_order_details_email(
            to_address=recipient_email,
            order_number=order_number,
            customer_name=customer_name,
            pdf_content=pdf_bytes
        )

        if success:
            return jsonify({
                "success": True,
                "message": f"Order Details PDF sent to {recipient_email}",
                "recipient": recipient_email
            })
        else:
            abort(500, description="Failed to send email. Check Power Automate configuration.")


# SocketIO event handlers will be registered in main.py
