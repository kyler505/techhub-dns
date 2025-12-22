from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import SessionLocal
from app.services.inflow_service import InflowService
from app.services.order_service import OrderService
from app.models.inflow_webhook import InflowWebhook, WebhookStatus
from app.config import settings
import logging

logger = logging.getLogger(__name__)


async def sync_inflow_orders():
    """Background task to sync orders from Inflow"""
    db = SessionLocal()
    try:
        inflow_service = InflowService()
        order_service = OrderService(db)

        logger.info("Starting Inflow sync...")

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

        logger.info(f"Inflow sync completed: {len(inflow_orders)} synced, {orders_created} created, {orders_updated} updated")

    except Exception as e:
        logger.error(f"Inflow sync failed: {e}", exc_info=True)
    finally:
        db.close()


def _has_active_webhook(db: Session) -> bool:
    """Check if there's an active webhook registered"""
    webhook = db.query(InflowWebhook).filter(
        InflowWebhook.status == WebhookStatus.ACTIVE
    ).first()
    return webhook is not None


def _check_webhook_health(db: Session):
    """Check webhook health and alert if no events received recently"""
    webhook = db.query(InflowWebhook).filter(
        InflowWebhook.status == WebhookStatus.ACTIVE
    ).first()

    if webhook:
        # Alert if no events received in last 2 hours
        if webhook.last_received_at:
            time_since_last = datetime.utcnow() - webhook.last_received_at
            if time_since_last > timedelta(hours=2):
                logger.warning(
                    f"Webhook health check: No events received in {time_since_last}. "
                    f"Last received: {webhook.last_received_at}"
                )
        else:
            logger.warning("Webhook health check: No events received since registration")


async def webhook_health_check():
    """Background task to check webhook health"""
    db = SessionLocal()
    try:
        _check_webhook_health(db)
    except Exception as e:
        logger.error(f"Webhook health check failed: {e}", exc_info=True)
    finally:
        db.close()


def start_scheduler():
    """Start the APScheduler for periodic Inflow sync"""
    scheduler = AsyncIOScheduler()
    poll_interval = None
    poll_interval_override = settings.inflow_polling_sync_interval_minutes

    # Check if polling sync is enabled
    if settings.inflow_polling_sync_enabled:
        if poll_interval_override is not None:
            if poll_interval_override <= 0:
                logger.warning(
                    "INFLOW_POLLING_SYNC_INTERVAL_MINUTES must be > 0; "
                    "falling back to default polling frequency"
                )
            else:
                poll_interval = poll_interval_override
                logger.info(
                    "Using INFLOW_POLLING_SYNC_INTERVAL_MINUTES override for polling frequency"
                )

        if poll_interval is None:
            # Check webhook status to determine polling frequency
            db = SessionLocal()
            try:
                has_webhook = _has_active_webhook(db)

                if has_webhook and settings.inflow_webhook_enabled:
                    # Webhooks active: poll less frequently (backup/catch-up)
                    poll_interval = 30
                    logger.info("Webhooks enabled - using reduced polling frequency as backup")
                else:
                    # No webhooks: use normal polling frequency
                    poll_interval = 5
                    logger.info("Webhooks not enabled - using normal polling frequency")
            finally:
                db.close()

        # Sync job (backup polling)
        scheduler.add_job(
            sync_inflow_orders,
            trigger=IntervalTrigger(minutes=poll_interval),
            id="inflow_sync",
            name="Sync orders from Inflow (backup polling)",
            replace_existing=True,
            next_run_time=datetime.now()
        )
    else:
        logger.info("Inflow polling sync is disabled via INFLOW_POLLING_SYNC_ENABLED")

    # Webhook health check (every hour)
    # Temporarily disabled
    # if settings.inflow_webhook_enabled:
    #     scheduler.add_job(
    #         webhook_health_check,
    #         trigger=IntervalTrigger(hours=1),
    #         id="webhook_health_check",
    #         name="Webhook health check",
    #         replace_existing=True
    #     )

    scheduler.start()
    if settings.inflow_polling_sync_enabled and poll_interval:
        logger.info(f"Scheduler started - Inflow polling sync enabled (every {poll_interval} minutes)")
    else:
        logger.info("Scheduler started - Inflow polling sync disabled")
    return scheduler
