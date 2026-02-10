from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db_session
from app.services.inflow_service import InflowService
from app.services.order_service import OrderService
from app.services.maintenance_service import archive_system_audit_logs, purge_sessions
from app.models.inflow_webhook import InflowWebhook, WebhookStatus
from app.config import settings
import logging
import threading
from typing import Any

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
                continue
            except Exception as e:
                logger.error(f"Error processing order {inflow_order.get('orderNumber')}: {e}", exc_info=True)
                continue

        logger.info(f"Inflow sync completed: {len(inflow_orders)} synced, {orders_created} created, {orders_updated} updated")

        # Broadcast order updates via SocketIO
        if orders_created > 0 or orders_updated > 0:
            threading.Thread(target=_broadcast_orders_sync).start()

    except Exception as e:
        logger.error(f"Inflow sync failed: {e}", exc_info=True)
    finally:
        db.close()


def _has_active_webhook(db: Session) -> bool:
    """Check if there's an active webhook registered"""
    webhook = db.query(InflowWebhook).filter(
        InflowWebhook.status == WebhookStatus.active
    ).first()
    return webhook is not None


def _check_webhook_health(db: Session):
    """Check webhook health and alert if no events received recently"""
    webhook: Any = db.query(InflowWebhook).filter(
        InflowWebhook.status == WebhookStatus.active
    ).first()

    if webhook is None:
        return

    # Alert if no events received in last 2 hours
    last_received_at = getattr(webhook, "last_received_at", None)
    if isinstance(last_received_at, datetime):
        time_since_last = datetime.utcnow() - last_received_at
        if time_since_last > timedelta(hours=2):
            logger.warning(
                f"Webhook health check: No events received in {time_since_last}. "
                f"Last received: {last_received_at}"
            )
        return

    logger.warning("Webhook health check: No events received since registration")


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

    # Webhook health check (every hour) - temporarily disabled
    # if settings.inflow_webhook_enabled:
    #     scheduler.add_job(
    #         webhook_health_check,
    #         trigger=IntervalTrigger(hours=1),
    #         id="webhook_health_check",
    #         name="Webhook health check",
    #         replace_existing=True
    #     )

    if bool(getattr(settings, "session_purge_enabled", True)):
        purge_interval_hours = int(getattr(settings, "session_purge_interval_hours", 24) or 24)
        purge_interval_hours = max(1, min(purge_interval_hours, 24 * 30))

        def purge_sessions_job():
            db = get_db_session()
            try:
                deleted = purge_sessions(db)
                if deleted:
                    logger.info(f"Purged {deleted} expired/revoked session(s)")
            except Exception as e:
                logger.error(f"Session purge job failed: {e}", exc_info=True)
            finally:
                db.close()

        scheduler.add_job(
            purge_sessions_job,
            trigger=IntervalTrigger(hours=purge_interval_hours),
            id="purge_sessions",
            name="Purge expired/revoked sessions",
            replace_existing=True,
            next_run_time=datetime.now(),
        )

    if bool(getattr(settings, "system_audit_archive_enabled", True)):
        archive_interval_hours = int(getattr(settings, "system_audit_archive_interval_hours", 24) or 24)
        archive_interval_hours = max(1, min(archive_interval_hours, 24 * 30))

        def archive_system_audit_job():
            db = get_db_session()
            try:
                moved = archive_system_audit_logs(db)
                if moved:
                    logger.info(f"Archived {moved} system audit log row(s)")
            except Exception as e:
                logger.error(f"System audit archive job failed: {e}", exc_info=True)
            finally:
                db.close()

        scheduler.add_job(
            archive_system_audit_job,
            trigger=IntervalTrigger(hours=archive_interval_hours),
            id="archive_system_audit_logs",
            name="Archive old system audit logs",
            replace_existing=True,
            next_run_time=datetime.now(),
        )

    scheduler.start()
    if settings.inflow_polling_sync_enabled and poll_interval:
        logger.info(f"Scheduler started - Inflow polling sync enabled (every {poll_interval} minutes)")
    else:
        logger.info("Scheduler started - Inflow polling sync disabled")
    return scheduler
