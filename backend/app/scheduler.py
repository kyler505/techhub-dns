from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import asyncio
from app.database import get_db_session
from app.services.inflow_service import InflowService
from app.services.order_service import OrderService
from app.models.inflow_webhook import InflowWebhook, WebhookStatus
from app.config import settings
from app.utils.broadcast_dedup import broadcast_dedup
import logging

logger = logging.getLogger(__name__)


def sync_inflow_orders():
    """Background task to sync orders from Inflow (sync version)"""
    from app.api.routes.orders import _broadcast_orders_sync

    db = get_db_session()
    try:
        inflow_service = InflowService()
        order_service = OrderService(db)

        logger.info("Starting Inflow sync...")

        # Fetch recent started orders (sync version)
        inflow_orders = inflow_service.sync_recent_started_orders_sync(
            max_pages=3, per_page=100, target_matches=100
        )

        orders_created = 0
        orders_updated = 0

        for i, inflow_order in enumerate(inflow_orders):
            try:
                from app.models.order import Order

                order_number = inflow_order.get("orderNumber")
                existing = (
                    db.query(Order)
                    .filter(Order.inflow_order_id == order_number)
                    .first()
                )

                order = order_service.create_order_from_inflow(inflow_order)
                if not existing:
                    orders_created += 1
                else:
                    orders_updated += 1

                # Batch commit every 20 orders to avoid losing progress on crash
                if (i + 1) % 20 == 0:
                    db.commit()
            except ValueError as e:
                # ValueError is raised for skipped orders (e.g., not in Bryan/College Station)
                continue
            except Exception as e:
                db.rollback()
                logger.error(
                    f"Error processing order {inflow_order.get('orderNumber')}: {e}",
                    exc_info=True,
                )
                continue

        # Final commit for remaining orders
        db.commit()

        logger.info(
            f"Inflow sync completed: {len(inflow_orders)} synced, {orders_created} created, {orders_updated} updated"
        )

        # Broadcast order updates via SocketIO
        if orders_created > 0 or orders_updated > 0:
            broadcast_dedup.request_broadcast(_broadcast_orders_sync)

    except Exception as e:
        logger.error(f"Inflow sync failed: {e}", exc_info=True)
    finally:
        db.close()


def _has_active_webhook(db: Session) -> bool:
    """Check if there's an active webhook registered"""
    webhook = (
        db.query(InflowWebhook)
        .filter(InflowWebhook.status == WebhookStatus.active)
        .first()
    )
    return webhook is not None


def _check_webhook_health(db: Session):
    """Check webhook health and alert if no events received recently"""
    webhook = (
        db.query(InflowWebhook)
        .filter(InflowWebhook.status == WebhookStatus.active)
        .first()
    )

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
            logger.warning(
                "Webhook health check: No events received since registration"
            )


def webhook_health_check():
    """Background task to check webhook health (sync version)"""
    db = get_db_session()
    try:
        _check_webhook_health(db)
    except Exception as e:
        logger.error(f"Webhook health check failed: {e}", exc_info=True)
    finally:
        db.close()


def start_scheduler():
    """Start the APScheduler for periodic Inflow sync"""
    scheduler = BackgroundScheduler()
    poll_interval = None

    # Check if polling sync is enabled
    if settings.inflow_polling_sync_enabled:
        # Check webhook status to determine polling frequency
        db = get_db_session()
        try:
            has_webhook = _has_active_webhook(db)

            if has_webhook and settings.inflow_webhook_enabled:
                # Webhooks active: poll less frequently (backup/catch-up)
                poll_interval = 30
                logger.info(
                    "Webhooks enabled - using reduced polling frequency as backup"
                )
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
            next_run_time=datetime.now(),
        )
    else:
        logger.info("Inflow polling sync is disabled via INFLOW_POLLING_SYNC_ENABLED")

    # Webhook health check (every hour) - temporarily disabled
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
        logger.info(
            f"Scheduler started - Inflow polling sync enabled (every {poll_interval} minutes)"
        )
    else:
        logger.info("Scheduler started - Inflow polling sync disabled")
    return scheduler


def auto_register_inflow_webhook() -> None:
    """Register the configured Inflow webhook when the scheduler starts."""
    if not settings.inflow_webhook_url:
        logger.warning(
            "Webhook auto-registration skipped: INFLOW_WEBHOOK_URL not configured"
        )
        return

    if not settings.inflow_webhook_events:
        logger.warning("Webhook auto-registration skipped: no events configured")
        return

    target_url = settings.inflow_webhook_url.strip().rstrip("/")
    db = get_db_session()
    try:
        existing = (
            db.query(InflowWebhook)
            .filter(InflowWebhook.status == WebhookStatus.active)
            .all()
        )

        for webhook in existing:
            if webhook.url.strip().rstrip("/") == target_url:
                logger.info(
                    "Webhook already registered for %s (ID: %s)",
                    target_url,
                    webhook.webhook_id,
                )
                return
    finally:
        db.close()

    logger.info("Auto-registering Inflow webhook: %s", target_url)

    async def register():
        service = InflowService()
        try:
            remote_webhooks = await service.list_webhooks()
            for item in remote_webhooks:
                remote_url = (item.get("url") or "").strip().rstrip("/")
                if remote_url == target_url:
                    webhook_id = item.get("webHookSubscriptionId") or item.get("id")
                    if webhook_id:
                        logger.info(
                            "Cleaning up existing remote webhook: %s", webhook_id
                        )
                        await service.delete_webhook(webhook_id)
        except Exception as exc:
            logger.warning("Could not clean up remote webhooks: %s", exc)

        return await service.register_webhook(
            target_url, settings.inflow_webhook_events
        )

    try:
        result = asyncio.run(register())
        webhook_id = result.get("webHookSubscriptionId") or result.get("id")
        if not webhook_id:
            logger.error("Webhook registration did not return an ID: %s", result)
            return

        db = get_db_session()
        try:
            db.query(InflowWebhook).filter(
                InflowWebhook.status == WebhookStatus.active
            ).update({"status": WebhookStatus.inactive})

            db.add(
                InflowWebhook(
                    webhook_id=webhook_id,
                    url=target_url,
                    events=settings.inflow_webhook_events,
                    status=WebhookStatus.active,
                    secret=result.get("secret") or settings.inflow_webhook_secret,
                )
            )
            db.commit()
            logger.info("Webhook auto-registered successfully: %s", webhook_id)
        except Exception as exc:
            db.rollback()
            logger.error("Failed to save webhook to database: %s", exc)
        finally:
            db.close()
    except Exception as exc:
        logger.error("Webhook auto-registration failed: %s", exc)
