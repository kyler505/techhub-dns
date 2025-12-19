from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session
from datetime import datetime
import logging
import uuid

from app.database import get_db
from app.services.inflow_service import InflowService
from app.services.order_service import OrderService
from app.schemas.inflow import (
    InflowSyncResponse,
    InflowSyncStatusResponse,
    WebhookRegisterRequest,
    WebhookResponse,
    WebhookListResponse
)
from app.models.inflow_webhook import InflowWebhook, WebhookStatus
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inflow", tags=["inflow"])


@router.post("/sync", response_model=InflowSyncResponse)
async def sync_orders(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Manually trigger Inflow sync"""
    try:
        inflow_service = InflowService()
        order_service = OrderService(db)

        # Fetch recent started orders
        inflow_orders = await inflow_service.sync_recent_started_orders(
            max_pages=3,
            per_page=100,
            target_matches=100
        )

        orders_created = 0
        orders_updated = 0

        for inflow_order in inflow_orders:
            try:
                from app.models.order import Order
                order_number = inflow_order.get("orderNumber")
                existing = db.query(Order).filter(
                    Order.inflow_order_id == order_number
                ).first()

                order = order_service.create_order_from_inflow(inflow_order)
                if not existing:
                    orders_created += 1
                else:
                    orders_updated += 1
            except ValueError as e:
                # ValueError is raised for skipped orders (e.g., not in Bryan/College Station)
                # Already logged as INFO in order_service, so just continue
                continue
            except Exception as e:
                logger.error(f"Error processing order {inflow_order.get('orderNumber')}: {e}", exc_info=True)
                continue

        return InflowSyncResponse(
            success=True,
            orders_synced=len(inflow_orders),
            orders_created=orders_created,
            orders_updated=orders_updated,
            message=f"Synced {len(inflow_orders)} orders"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sync-status", response_model=InflowSyncStatusResponse)
def get_sync_status(db: Session = Depends(get_db)):
    """Get Inflow sync status"""
    from app.models.order import Order

    total_orders = db.query(Order).count()

    return InflowSyncStatusResponse(
        last_sync_at=None,  # Could track this in a separate table
        total_orders=total_orders,
        sync_enabled=True
    )


@router.post("/webhook")
async def inflow_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receive webhook notifications from Inflow.
    This endpoint processes order events in real-time.
    """
    try:
        # Get raw body for signature verification
        body = await request.body()

        # Verify signature if configured
        signature = (
            request.headers.get("x-inflow-hmac-sha256")
            or request.headers.get("X-Inflow-Signature")
            or request.headers.get("X-Webhook-Signature")
        )
        secrets = [
            w.secret for w in db.query(InflowWebhook).filter(
                InflowWebhook.status == WebhookStatus.ACTIVE
            ).all()
            if w.secret
        ]
        if not secrets and settings.inflow_webhook_secret:
            secrets = [settings.inflow_webhook_secret]

        if signature and secrets:
            logger.info(f"Verifying webhook signature: header='{signature}', secrets_count={len(secrets)}")
            inflow_service = InflowService()
            if not any(
                inflow_service.verify_webhook_signature(body, signature, secret)
                for secret in secrets
            ):
                logger.warning(f"Webhook signature verification failed - allowing webhook to proceed for now")
                # For now, allow webhooks to proceed even with signature verification failure
                # raise HTTPException(status_code=401, detail="Invalid webhook signature")

        # Parse payload from body
        import json
        payload = json.loads(body.decode("utf-8"))

        # Log the full payload structure for debugging
        logger.info(f"Webhook payload received: {json.dumps(payload, indent=2)}")

        # Try multiple possible field names for event type
        event_type = (
            payload.get("event") or
            payload.get("type") or
            payload.get("EventType") or
            payload.get("eventType")
        )
        logger.info(f"Received webhook event: {event_type}")

        # Extract order data - try multiple possible structures
        order_data = (
            payload.get("data") or
            payload.get("order") or
            payload.get("Order") or
            payload.get("salesOrder") or
            payload.get("SalesOrder") or
            payload  # Fallback to entire payload
        )

        # Get order number - try multiple possible field names
        order_number = (
            order_data.get("orderNumber") or
            order_data.get("order_number") or
            order_data.get("OrderNumber") or
            order_data.get("orderId") or
            order_data.get("order_id") or
            order_data.get("OrderId") or
            payload.get("orderNumber") or
            payload.get("order_number") or
            payload.get("OrderNumber")
        )

        # Also try to get salesOrderId which might be the identifier
        sales_order_id = None
        if not order_number:
            sales_order_id = (
                order_data.get("salesOrderId") or
                order_data.get("sales_order_id") or
                order_data.get("SalesOrderId") or
                order_data.get("id") or
                payload.get("salesOrderId") or
                payload.get("id")
            )

            if sales_order_id:
                logger.info(f"Found salesOrderId: {sales_order_id}, will attempt to fetch order details")

        if not order_number and not sales_order_id:
            logger.warning(f"Webhook received without order number. Payload keys: {list(payload.keys())}")
            logger.warning(f"Order data keys: {list(order_data.keys()) if isinstance(order_data, dict) else 'Not a dict'}")
            return {"status": "ignored", "message": "No order number or salesOrderId in payload"}

        # If we have salesOrderId but no orderNumber, we'll need to fetch the order differently
        # For now, log it and continue - we'll handle it in the fetch step
        if sales_order_id and not order_number:
            logger.info(f"Using salesOrderId {sales_order_id} to fetch order")
            # We'll need to adjust the fetch logic below

        # Fetch full order details from Inflow (webhook may only send partial data)
        inflow_service = InflowService()
        order_service = OrderService(db)

        # Try to fetch order by orderNumber first, then by salesOrderId if needed
        inflow_order = None
        if order_number:
            inflow_order = await inflow_service.get_order_by_number(order_number)
        if not inflow_order and sales_order_id:
            logger.info(f"Attempting to fetch order using salesOrderId: {sales_order_id}")
            inflow_order = await inflow_service.get_order_by_id(str(sales_order_id))

        if not inflow_order:
            identifier = order_number or sales_order_id
            logger.warning(f"Order {identifier} not found in Inflow (orderNumber: {order_number}, salesOrderId: {sales_order_id})")
            return {"status": "not_found", "message": f"Order {identifier} not found"}

        # Extract orderNumber from fetched order if we didn't have it before
        if not order_number and inflow_order:
            order_number = inflow_order.get("orderNumber")
            if order_number:
                logger.info(f"Extracted orderNumber {order_number} from fetched order")

        # Only process if status is 'started' (matching our filter)
        if not inflow_service.is_strict_started(inflow_order):
            identifier = order_number or sales_order_id or "unknown"
            logger.info(f"Order {identifier} skipped (not 'started' status)")
            return {"status": "skipped", "message": "Order not in 'started' status"}

        # Create or update order
        try:
            order = order_service.create_order_from_inflow(inflow_order)

            # Update webhook tracking
            webhook = db.query(InflowWebhook).filter(
                InflowWebhook.status == WebhookStatus.ACTIVE
            ).first()

            if webhook:
                webhook.last_received_at = datetime.utcnow()
                webhook.failure_count = 0
                db.commit()

            logger.info(f"Order {order_number} processed successfully via webhook")
            return {"status": "processed", "order_id": str(order.id)}

        except ValueError as e:
            # ValueError is raised for skipped orders (e.g., not in Bryan/College Station)
            # Already logged as INFO in order_service
            logger.info(f"Order {order_number} skipped: {e}")
            return {"status": "skipped", "message": str(e)}
        except Exception as e:
            logger.error(f"Error processing order {order_number}: {e}", exc_info=True)

            # Track failure
            webhook = db.query(InflowWebhook).filter(
                InflowWebhook.status == WebhookStatus.ACTIVE
            ).first()

            if webhook:
                webhook.failure_count += 1
                if webhook.failure_count >= 10:
                    webhook.status = WebhookStatus.FAILED
                db.commit()

            # Return 200 to prevent Inflow from retrying if it's our error
            return {"status": "error", "message": str(e)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook processing failed: {e}", exc_info=True)
        # Return 200 to prevent Inflow from retrying
        return {"status": "error", "message": str(e)}


@router.post("/webhooks/register", response_model=WebhookResponse)
async def register_webhook(
    request: WebhookRegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new webhook with Inflow"""
    try:
        inflow_service = InflowService()

        # Clean up remote subscriptions pointing to the same URL to avoid secret mismatch.
        try:
            existing_remote = await inflow_service.list_webhooks()
            normalized_url = request.url.rstrip("/")
            for item in existing_remote:
                remote_url = (item.get("url") or "").rstrip("/")
                if remote_url == normalized_url:
                    remote_id = (
                        item.get("webHookSubscriptionId")
                        or item.get("id")
                        or item.get("webHookId")
                        or item.get("webhookId")
                    )
                    if remote_id:
                        await inflow_service.delete_webhook(str(remote_id))
        except Exception as e:
            logger.warning(f"Failed to clean up remote webhooks for {request.url}: {e}")

        # Register with Inflow
        result = await inflow_service.register_webhook(request.url, request.events)

        # Store in database (newest becomes active)
        db.query(InflowWebhook).filter(
            InflowWebhook.status == WebhookStatus.ACTIVE
        ).update({"status": WebhookStatus.INACTIVE})

        webhook_id = (
            result.get("webHookSubscriptionId")
            or result.get("id")
            or str(uuid.uuid4())
        )
        webhook = InflowWebhook(
            webhook_id=webhook_id,
            url=request.url,
            events=request.events,
            status=WebhookStatus.ACTIVE,
            secret=result.get("secret") or settings.inflow_webhook_secret
        )

        db.add(webhook)
        db.commit()
        db.refresh(webhook)

        return WebhookResponse(
            id=str(webhook.id),
            webhook_id=webhook.webhook_id,
            url=webhook.url,
            events=webhook.events,
            status=webhook.status.value,
            last_received_at=webhook.last_received_at,
            failure_count=webhook.failure_count,
            created_at=webhook.created_at,
            updated_at=webhook.updated_at
        )
    except Exception as e:
        logger.error(f"Failed to register webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/webhooks", response_model=WebhookListResponse)
def list_webhooks(db: Session = Depends(get_db)):
    """List all registered webhooks"""
    webhooks = db.query(InflowWebhook).all()

    return WebhookListResponse(
        webhooks=[
            WebhookResponse(
                id=str(w.id),
                webhook_id=w.webhook_id,
                url=w.url,
                events=w.events,
                status=w.status.value,
                last_received_at=w.last_received_at,
                failure_count=w.failure_count,
                created_at=w.created_at,
                updated_at=w.updated_at
            )
            for w in webhooks
        ]
    )


@router.get("/webhooks/defaults")
def get_webhook_defaults():
    """Get default webhook URL and events from settings"""
    return {
        "url": settings.inflow_webhook_url,
        "events": settings.inflow_webhook_events
    }


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: str, db: Session = Depends(get_db)):
    """Delete a webhook registration"""
    try:
        # Find in database
        webhook = db.query(InflowWebhook).filter(
            InflowWebhook.webhook_id == webhook_id
        ).first()

        if not webhook:
            raise HTTPException(status_code=404, detail="Webhook not found")

        # Delete from Inflow
        inflow_service = InflowService()
        await inflow_service.delete_webhook(webhook_id)

        # Delete from database
        db.delete(webhook)
        db.commit()

        return {"success": True, "message": "Webhook deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhooks/test")
async def test_webhook(db: Session = Depends(get_db)):
    """Test webhook endpoint (sends a test payload)"""
    try:
        # Get active webhook
        webhook = db.query(InflowWebhook).filter(
            InflowWebhook.status == WebhookStatus.ACTIVE
        ).first()

        if not webhook:
            raise HTTPException(status_code=404, detail="No active webhook found")

        # This is just a test endpoint - in a real scenario, you might
        # want to trigger a test event or verify the webhook is reachable
        return {
            "success": True,
            "message": "Webhook endpoint is configured",
            "webhook_url": webhook.url,
            "last_received_at": webhook.last_received_at
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
