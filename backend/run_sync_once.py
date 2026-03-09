import logging

from app.config import settings
from app.database import get_runtime_db_pool_settings
from app.scheduler import auto_register_inflow_webhook, sync_inflow_orders


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> int:
    if not settings.inflow_polling_sync_enabled:
        logger.info(
            "One-shot Inflow sync skipped: INFLOW_POLLING_SYNC_ENABLED is false"
        )
        return 0

    pool_settings = get_runtime_db_pool_settings()
    logger.info(
        "Starting one-shot Inflow sync: db_backend=%s pool_size=%s max_overflow=%s pool_timeout=%s pool_recycle=%s",
        pool_settings.get("database_backend"),
        pool_settings.get("pool_size"),
        pool_settings.get("max_overflow"),
        pool_settings.get("pool_timeout"),
        pool_settings.get("pool_recycle"),
    )

    if settings.inflow_webhook_auto_register:
        auto_register_inflow_webhook()

    sync_inflow_orders()
    logger.info("One-shot Inflow sync completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
