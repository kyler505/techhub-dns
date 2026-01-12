from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix
from app.config import settings
from app.api.routes import orders, inflow, teams, audit, delivery_runs, sharepoint
from app.api.middleware import register_error_handlers
from app.scheduler import start_scheduler
import logging
import atexit

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

# Global scheduler reference
_scheduler = None
_initialized = False


def init_scheduler():
    """Initialize the scheduler on first request"""
    global _scheduler, _initialized
    if not _initialized:
        _initialized = True
        try:
            _scheduler = start_scheduler()
            logger.info("Application started")
        except Exception as e:
            logger.error(f"Error during startup: {e}")
            raise


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
app.register_blueprint(teams.bp, url_prefix="/api/teams")
app.register_blueprint(audit.bp, url_prefix="/api/audit")
app.register_blueprint(delivery_runs.bp, url_prefix="/api/delivery-runs")
app.register_blueprint(sharepoint.sharepoint_bp)


@app.route("/")
def root():
    return jsonify({"message": "TechHub Delivery Workflow API", "version": "1.0.0"})


@app.route("/health")
def health():
    return jsonify({"status": "healthy"})


@app.before_request
def before_request():
    """Initialize scheduler before first request"""
    init_scheduler()


if __name__ == "__main__":
    # Development server - use waitress for production
    socketio.run(app, host="0.0.0.0", port=8000, debug=True)
