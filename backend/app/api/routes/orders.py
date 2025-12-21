from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
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
    QASubmission
)
from app.models.order import OrderStatus
from app.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/orders", tags=["orders"])


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
    try:
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

        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bulk-transition", response_model=List[OrderResponse])
def bulk_transition_status(
    bulk_update: BulkStatusUpdate,
    changed_by: Optional[str] = Query(None, description="User making the change"),
    db: Session = Depends(get_db)
):
    """Bulk transition multiple orders"""
    service = OrderService(db)
    try:
        orders = service.bulk_transition(
            order_ids=bulk_update.order_ids,
            new_status=bulk_update.status,
            changed_by=changed_by,
            reason=bulk_update.reason
        )
        return orders
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    try:
        order = service.mark_asset_tagged(
            order_id=order_id,
            tag_ids=tag_update.tag_ids,
            technician=tag_update.technician
        )
        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{order_id}/picklist", response_model=OrderResponse)
def generate_picklist(
    order_id: UUID,
    request: PicklistGenerationRequest,
    db: Session = Depends(get_db)
):
    """Generate a picklist PDF for the order"""
    service = OrderService(db)
    try:
        order = service.generate_picklist(
            order_id=order_id,
            generated_by=request.generated_by
        )
        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{order_id}/qa", response_model=OrderResponse)
async def submit_qa(
    order_id: UUID,
    submission: QASubmission,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Submit QA checklist for an order"""
    service = OrderService(db)
    try:
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

        return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    try:
        result = await inflow_service.fulfill_sales_order(order.inflow_sales_order_id)
        return {"success": True, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
