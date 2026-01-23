from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix
from app.config import settings
from app.api.routes import orders, inflow, audit, delivery_runs, sharepoint, auth, system
from app.api.middleware import register_error_handlers
from app.api.auth_middleware import init_auth_middleware
from app.scheduler import start_scheduler
import logging
import atexit
import os
import mimetypes

# Ensure common web file types have correct MIME types
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('text/html', '.html')
mimetypes.add_type('application/wasm', '.wasm')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.url_map.strict_slashes = False  # Prevent 308 redirects that break CORS

# Fix for running behind proxy (PythonAnywhere) - ensures correct URL generation
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Configure CORS - allow all origins (configure specific origins for production)
CORS(app, origins="*", supports_credentials=True)

# Configure Flask-SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Register error handlers
register_error_handlers(app)

# Initialize authentication middleware
init_auth_middleware(app)

# Global scheduler reference
_scheduler = None
_initialized = False

# Frontend static files path (for production deployment)
# Check multiple possible locations for the dist folder
def get_frontend_dist_path():
    possible_paths = [
        # PythonAnywhere path
        '/home/techhub/techhub-dns/frontend/dist',
        # Relative from backend (local dev)
        os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'frontend', 'dist'),
        # Resolved absolute path
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist')),
    ]
    for path in possible_paths:
        if os.path.exists(path) and os.path.isdir(path):
            return path
    return possible_paths[0]  # Fallback to PythonAnywhere path

FRONTEND_DIST_PATH = get_frontend_dist_path()


def init_scheduler():
    """Initialize the scheduler on first request"""
    global _scheduler, _initialized
    if not _initialized:
        _initialized = True
        try:
            _scheduler = start_scheduler()
            # Auto-register Inflow webhook if enabled
            if settings.inflow_webhook_auto_register:
                _auto_register_inflow_webhook()
            logger.info("Application started")
        except Exception as e:
            logger.error(f"Error during startup: {e}")
            raise


def _auto_register_inflow_webhook():
    """
    Automatically register Inflow webhook on startup if:
    1. Auto-registration is enabled (INFLOW_WEBHOOK_AUTO_REGISTER=true)
    2. Webhook URL is configured (INFLOW_WEBHOOK_URL)
    3. No active webhook exists for this URL
    """
    import asyncio
    from app.services.inflow_service import InflowService
    from app.database import SessionLocal
    from app.models.inflow_webhook import InflowWebhook, WebhookStatus

    if not settings.inflow_webhook_url:
        logger.warning("Webhook auto-registration skipped: INFLOW_WEBHOOK_URL not configured")
        return

    if not settings.inflow_webhook_events:
        logger.warning("Webhook auto-registration skipped: no events configured")
        return

    # Normalize URL for comparison
    target_url = settings.inflow_webhook_url.strip().rstrip("/")

    # Check if we already have an active webhook for this URL in local DB
    db = SessionLocal()
    try:
        existing = db.query(InflowWebhook).filter(
            InflowWebhook.status == WebhookStatus.active
        ).all()

        for webhook in existing:
            if webhook.url.strip().rstrip("/") == target_url:
                logger.info(f"Webhook already registered for {target_url} (ID: {webhook.webhook_id})")
                return
    finally:
        db.close()

    # No active webhook found, register a new one
    logger.info(f"Auto-registering Inflow webhook: {target_url}")

    async def register():
        service = InflowService()
        # First, clean up any remote webhooks with the same URL
        try:
            remote_webhooks = await service.list_webhooks()
            for item in remote_webhooks:
                remote_url = (item.get("url") or "").strip().rstrip("/")
                if remote_url == target_url:
                    webhook_id = item.get("webHookSubscriptionId") or item.get("id")
                    if webhook_id:
                        logger.info(f"Cleaning up existing remote webhook: {webhook_id}")
                        await service.delete_webhook(webhook_id)
        except Exception as e:
            logger.warning(f"Could not clean up remote webhooks: {e}")

        # Register new webhook
        result = await service.register_webhook(
            target_url,
            settings.inflow_webhook_events
        )
        return result

    try:
        # Run async registration
        result = asyncio.run(register())

        webhook_id = result.get("webHookSubscriptionId") or result.get("id")
        if not webhook_id:
            logger.error(f"Webhook registration did not return an ID: {result}")
            return

        # Store in local database
        db = SessionLocal()
        try:
            # Deactivate any existing active webhooks
            db.query(InflowWebhook).filter(
                InflowWebhook.status == WebhookStatus.active
            ).update({"status": WebhookStatus.inactive})

            # Create new webhook record
            new_webhook = InflowWebhook(
                webhook_id=webhook_id,
                url=target_url,
                events=settings.inflow_webhook_events,
                status=WebhookStatus.active,
                secret=result.get("secret")
            )
            db.add(new_webhook)
            db.commit()

            logger.info(f"Webhook auto-registered successfully: {webhook_id}")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to save webhook to database: {e}")
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Webhook auto-registration failed: {e}")


def shutdown_scheduler():
    """Shutdown scheduler on app exit"""
    global _scheduler
    if _scheduler:
        try:
            _scheduler.shutdown()
            logger.info("Application shutdown")
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")


# Register shutdown handler
atexit.register(shutdown_scheduler)


# Register blueprints with full path prefixes
app.register_blueprint(orders.bp, url_prefix="/api/orders")
app.register_blueprint(inflow.bp, url_prefix="/api/inflow")
app.register_blueprint(audit.bp, url_prefix="/api/audit")
app.register_blueprint(delivery_runs.bp, url_prefix="/api/delivery-runs")
app.register_blueprint(sharepoint.sharepoint_bp)
app.register_blueprint(auth.bp)
app.register_blueprint(system.bp)


@app.route("/health")
def health():
    return jsonify({"status": "healthy"})


@app.route("/api")
def api_root():
    return jsonify({"message": "TechHub Delivery Workflow API", "version": "1.0.0"})


# Serve React frontend static files (production only)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    """Serve React frontend. Falls back to index.html for client-side routing."""
    # Check if frontend dist exists (production mode)
    if os.path.exists(FRONTEND_DIST_PATH):
        # Serve static assets (js, css, images, etc.)
        if path:
            # Check if the file exists (use os.path.join for filesystem check)
            full_path = os.path.join(FRONTEND_DIST_PATH, path.replace('/', os.path.sep))
            if os.path.exists(full_path):
                # Determine the correct MIME type for the file
                mime_type, _ = mimetypes.guess_type(path)
                # send_from_directory expects forward slashes, not OS separators
                return send_from_directory(FRONTEND_DIST_PATH, path, mimetype=mime_type)

        # Fallback to index.html for SPA routing
        return send_from_directory(FRONTEND_DIST_PATH, 'index.html', mimetype='text/html')
    else:
        # Development mode - frontend served by Vite
        return jsonify({
            "message": "TechHub Delivery Workflow API",
            "version": "1.0.0",
            "note": "Frontend not built. Run 'npm run build' in frontend directory."
        })


@app.before_request
def before_request():
    """Initialize scheduler before first request"""
    init_scheduler()


if __name__ == "__main__":
    # Development server - use waitress for production
    socketio.run(app, host="0.0.0.0", port=8000, debug=True)
