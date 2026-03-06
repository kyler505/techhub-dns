import logging
import signal
import time

from app.config import settings
from app.database import get_runtime_db_pool_settings
from app.scheduler import auto_register_inflow_webhook, start_scheduler


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_running = True


def _handle_signal(signum, _frame):
    global _running
    logger.info("Received signal %s; shutting down scheduler runner", signum)
    _running = False


def main() -> int:
    if not settings.scheduler_enabled:
        logger.info("Background scheduler disabled via SCHEDULER_ENABLED")
        return 0

    pool_settings = get_runtime_db_pool_settings()
    logger.info(
        "Starting background scheduler runner: db_backend=%s pool_size=%s max_overflow=%s pool_timeout=%s pool_recycle=%s",
        pool_settings.get("database_backend"),
        pool_settings.get("pool_size"),
        pool_settings.get("max_overflow"),
        pool_settings.get("pool_timeout"),
        pool_settings.get("pool_recycle"),
    )

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    if settings.inflow_webhook_auto_register:
        auto_register_inflow_webhook()

    scheduler = start_scheduler()
    logger.info("Background scheduler runner started")

    try:
        while _running:
            time.sleep(5)
    finally:
        scheduler.shutdown()
        logger.info("Background scheduler runner stopped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
