from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix
from app.config import settings
from app.api.routes import orders, inflow, teams, audit, delivery_runs, sharepoint
from app.api.middleware import register_error_handlers
from app.scheduler import start_scheduler
import logging
import atexit
import os

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
        if path and os.path.exists(os.path.join(FRONTEND_DIST_PATH, path)):
            return send_from_directory(FRONTEND_DIST_PATH, path)
        # Fallback to index.html for SPA routing
        return send_from_directory(FRONTEND_DIST_PATH, 'index.html')
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
