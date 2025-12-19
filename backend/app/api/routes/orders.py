from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID

from app.database import get_db
from app.services.order_service import OrderService
from app.services.teams_service import TeamsService
from app.schemas.order import (
    OrderResponse,
    OrderDetailResponse,
    OrderStatusUpdate,
    BulkStatusUpdate,
    OrderUpdate
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
    from app.schemas.teams import TeamsNotificationResponse

    service = OrderService(db)
    order = service.get_order_detail(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Convert to dict and add notifications
    order_dict = OrderDetailResponse.model_validate(order).model_dump()
    order_dict["teams_notifications"] = [
        TeamsNotificationResponse.model_validate(n).model_dump() for n in order.teams_notifications
    ]
    return order_dict


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
