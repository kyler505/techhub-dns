from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from pathlib import Path

from app.database import get_db
from app.services.order_service import OrderService
from app.services.teams_service import TeamsService
from app.services.inflow_service import InflowService
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
    ShippingWorkflowResponse
)
from app.models.order import OrderStatus
from app.schemas.audit import AuditLogResponse
from app.utils.exceptions import DNSApiError, NotFoundError, ValidationError

router = APIRouter(prefix="/orders", tags=["orders"])

# Simple in-memory broadcaster for WebSocket clients
_order_websockets: List[WebSocket] = []


async def _broadcast_orders(db_session: Session = None):
    """Send current orders to all connected websockets."""
    # Create our own session if none provided
    if db_session is None:
        from app.database import SessionLocal
        db_session = SessionLocal()

    try:
        service = OrderService(db_session)
        # Get all orders (we could optimize this later with filtering/caching)
        orders, _ = service.get_orders(limit=1000)  # Get up to 1000 orders
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

        # Broadcast
        to_remove = []
        for ws in _order_websockets:
            try:
                await ws.send_json({"type": "orders_update", "data": payload})
            except Exception:
                to_remove.append(ws)

        for rem in to_remove:
            try:
                _order_websockets.remove(rem)
            except ValueError:
                pass
    finally:
        if db_session is not None and hasattr(db_session, 'close'):
            db_session.close()


@router.get("", response_model=List[OrderResponse])
def get_orders(
    status: Optional[OrderStatus] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search in order ID, recipient, location"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get orders with filters and pagination"""
    service = OrderService(db)
    orders, total = service.get_orders(status=status, search=search, skip=skip, limit=limit)
    return orders


@router.get("/{order_id}", response_model=OrderDetailResponse)
def get_order(order_id: UUID, db: Session = Depends(get_db)):
    """Get order detail with audit logs and notifications"""
    service = OrderService(db)
    order = service.get_order_detail(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return OrderDetailResponse.model_validate(order)


@router.patch("/{order_id}", response_model=OrderResponse)
def update_order(
    order_id: UUID,
    update: OrderUpdate,
    db: Session = Depends(get_db)
):
    """Update order fields"""
    service = OrderService(db)
    order = service.get_order_detail(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    for field, value in update.dict(exclude_unset=True).items():
        setattr(order, field, value)

    db.commit()
    db.refresh(order)
    return order


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: UUID,
    status_update: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    changed_by: Optional[str] = Query(None, description="User making the change"),
    db: Session = Depends(get_db)
):
    """Transition order status"""
    service = OrderService(db)
    order = service.transition_status(
        order_id=order_id,
        new_status=status_update.status,
        changed_by=changed_by,
        reason=status_update.reason
    )

    # Send Teams notification in background if transitioning to In Delivery
    if status_update.status == OrderStatus.IN_DELIVERY:
        teams_service = TeamsService(db)
        background_tasks.add_task(
            teams_service.send_delivery_notification,
            order,
            order.assigned_deliverer
        )
    if status_update.status == OrderStatus.PRE_DELIVERY:
        teams_service = TeamsService(db)
        background_tasks.add_task(
            teams_service.send_ready_notification,
            order
        )

    # Broadcast order update via WebSocket
    try:
        import asyncio
        asyncio.create_task(_broadcast_orders(db))
    except Exception:
        pass  # WebSocket broadcasting is best-effort

    return order


@router.post("/bulk-transition", response_model=List[OrderResponse])
def bulk_transition_status(
    bulk_update: BulkStatusUpdate,
    changed_by: Optional[str] = Query(None, description="User making the change"),
    db: Session = Depends(get_db)
):
    """Bulk transition multiple orders"""
    service = OrderService(db)
    orders = service.bulk_transition(
        order_ids=bulk_update.order_ids,
        new_status=bulk_update.status,
        changed_by=changed_by,
        reason=bulk_update.reason
    )

    # Broadcast order updates via WebSocket
    try:
        import asyncio
        asyncio.create_task(_broadcast_orders(db))
    except Exception:
        pass  # WebSocket broadcasting is best-effort

    return orders


@router.get("/{order_id}/audit", response_model=List[AuditLogResponse])
def get_order_audit(order_id: UUID, db: Session = Depends(get_db)):
    """Get audit log for an order"""
    service = OrderService(db)
    order = service.get_order_detail(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order.audit_logs


@router.post("/{order_id}/tag", response_model=OrderResponse)
def tag_order(
    order_id: UUID,
    tag_update: AssetTagUpdate,
    db: Session = Depends(get_db)
):
    """Mock asset tagging step"""
    service = OrderService(db)
    order = service.mark_asset_tagged(
        order_id=order_id,
        tag_ids=tag_update.tag_ids,
        technician=tag_update.technician
    )
    return order


@router.post("/{order_id}/picklist", response_model=OrderResponse)
def generate_picklist(
    order_id: UUID,
    request: PicklistGenerationRequest,
    db: Session = Depends(get_db)
):
    """Generate a picklist PDF for the order"""
    service = OrderService(db)
    order = service.generate_picklist(
        order_id=order_id,
        generated_by=request.generated_by
    )
    return order


@router.post("/{order_id}/qa", response_model=OrderResponse)
async def submit_qa(
    order_id: UUID,
    submission: QASubmission,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Submit QA checklist for an order"""
    service = OrderService(db)
    order = service.submit_qa(
        order_id=order_id,
        qa_data=submission.responses,
        technician=submission.technician
    )

    if order.status == OrderStatus.PICKED and service._prep_steps_complete(order):
        # Determine next status based on QA method
        qa_method = order.qa_method
        if qa_method == "Shipping":
            next_status = OrderStatus.SHIPPING
        else:
            # Default to PRE_DELIVERY for Delivery method or when method is not specified
            next_status = OrderStatus.PRE_DELIVERY

        order = service.transition_status(
            order_id=order_id,
            new_status=next_status,
            changed_by=submission.technician
        )

        # Only send ready notification for delivery orders, not shipping
        if next_status == OrderStatus.PRE_DELIVERY:
            teams_service = TeamsService(db)
            background_tasks.add_task(
                teams_service.send_ready_notification,
                order
            )

    # Broadcast order update via WebSocket
    try:
        import asyncio
        asyncio.create_task(_broadcast_orders(db))
    except Exception:
        pass  # WebSocket broadcasting is best-effort

    return order


@router.get("/{order_id}/picklist")
def get_picklist(order_id: UUID, db: Session = Depends(get_db)):
    """Download generated picklist PDF"""
    service = OrderService(db)
    order = service.get_order_detail(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.picklist_path:
        raise HTTPException(status_code=404, detail="Picklist not generated")

    path = Path(order.picklist_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Picklist file missing")

    return FileResponse(path, media_type="application/pdf", filename=path.name)


@router.post("/{order_id}/retry-notification")
async def retry_notification(
    order_id: UUID,
    db: Session = Depends(get_db)
):
    """Retry Teams notification for an order"""
    from app.services.teams_service import TeamsService
    from app.models.teams_notification import TeamsNotification, NotificationStatus

    service = OrderService(db)
    order = service.get_order_detail(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Find the most recent failed notification
    teams_service = TeamsService(db)
    notification = db.query(TeamsNotification).filter(
        TeamsNotification.order_id == order_id,
        TeamsNotification.status == NotificationStatus.FAILED
    ).order_by(TeamsNotification.created_at.desc()).first()

    if notification:
        # Retry existing notification
        notification = await teams_service.retry_notification(notification.id)
    else:
        # Send new notification
        notification = await teams_service.send_delivery_notification(
            order,
            order.assigned_deliverer
        )

    return {"success": True, "notification_id": str(notification.id)}


@router.post("/{order_id}/fulfill")
async def fulfill_order(
    order_id: UUID,
    db: Session = Depends(get_db)
):
    """Mark an order as fulfilled in Inflow (best-effort)."""
    service = OrderService(db)
    order = service.get_order_detail(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.inflow_sales_order_id:
        raise HTTPException(status_code=400, detail="Order missing inflow_sales_order_id")

    inflow_service = InflowService()
    result = await inflow_service.fulfill_sales_order(
        order.inflow_sales_order_id,
        db=db,
        user_id="system"  # Automated fulfillment
    )
    return {"success": True, "result": result}


@router.post("/{order_id}/sign")
async def sign_order(
    order_id: UUID,
    signature_data: SignatureData,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Complete order signing, generate bundled documents, and transition to Delivered status"""
    service = OrderService(db)

    # Get the current order
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

    # Generate bundled documents (signed picklist + QA form)
    bundled_path = service.generate_bundled_documents(
        order_id=order_id,
        signature_data=signature_data.model_dump()
    )

    # Update order status to Delivered using the service method (which creates audit log)
    from datetime import datetime
    order = service.transition_status(
        order_id=order_id,
        new_status=OrderStatus.DELIVERED,
        changed_by="system"  # Order signing is automated
    )

    # Record signature timestamp and bundled document path
    order.signature_captured_at = datetime.utcnow()
    order.signed_picklist_path = bundled_path
    order.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(order)

    # Send notification that delivery is complete
    background_tasks.add_task(
        service.teams_service.send_delivery_complete_notification,
        order
    )

    # Broadcast order update via WebSocket
    try:
        import asyncio
        asyncio.create_task(_broadcast_orders(db))
    except Exception:
        pass  # WebSocket broadcasting is best-effort

    return {
        "success": True,
        "message": "Order signed and bundled documents generated",
        "bundled_document_path": bundled_path
    }


@router.patch("/{order_id}/shipping-workflow", response_model=OrderResponse)
def update_shipping_workflow(
    order_id: UUID,
    request: ShippingWorkflowUpdateRequest,
    db: Session = Depends(get_db)
):
    """Update shipping workflow status for an order"""
    service = OrderService(db)
    order = service.transition_shipping_workflow(
        order_id=order_id,
        new_status=request.status,
        carrier_name=request.carrier_name,
        tracking_number=request.tracking_number,
        updated_by=request.updated_by
    )

    # Broadcast order update via WebSocket
    try:
        import asyncio
        asyncio.create_task(_broadcast_orders(db))
    except Exception:
        pass  # WebSocket broadcasting is best-effort

    return order


@router.get("/{order_id}/shipping-workflow", response_model=ShippingWorkflowResponse)
def get_shipping_workflow(order_id: UUID, db: Session = Depends(get_db)):
    """Get shipping workflow status for an order"""
    service = OrderService(db)
    order = service.get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return ShippingWorkflowResponse(
        shipping_workflow_status=order.shipping_workflow_status,
        shipping_workflow_status_updated_at=order.shipping_workflow_status_updated_at,
        shipping_workflow_status_updated_by=order.shipping_workflow_status_updated_by,
        shipped_to_carrier_at=order.shipped_to_carrier_at,
        shipped_to_carrier_by=order.shipped_to_carrier_by,
        carrier_name=order.carrier_name,
        tracking_number=order.tracking_number
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    _order_websockets.append(websocket)
    try:
        # Send initial snapshot
        await _broadcast_orders(db)

        while True:
            # Keep connection alive; no client messages required
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        try:
            _order_websockets.remove(websocket)
        except ValueError:
            pass
