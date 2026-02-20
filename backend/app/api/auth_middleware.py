"""
Authentication middleware.

Validates session cookies and attaches user to request context.
"""

import logging
from functools import wraps
from flask import request, g, jsonify

from app.config import settings
from app.database import get_db, get_db_session
from app.services.saml_auth_service import saml_auth_service
from app.services.system_setting_service import SystemSettingService, SETTING_ADMIN_EMAILS
from app.services.maintenance_tick_service import schedule_maintenance_tick_if_needed

logger = logging.getLogger(__name__)

# Routes that don't require authentication
PUBLIC_ROUTES = [
    "/auth/",  # All auth routes
    "/health",
    "/api/inflow/webhook",  # Inflow webhook callbacks
]

STATIC_ROUTE_PREFIXES = (
    "/assets/",
    "/static/",
)

STATIC_ROUTE_EXACT = {
    "/favicon.ico",
    "/manifest.webmanifest",
    "/site.webmanifest",
    "/sw.js",
    "/robots.txt",
    "/apple-touch-icon.png",
}


def _is_static_asset_request(path: str) -> bool:
    if path.startswith("/api/"):
        return False
    if path in STATIC_ROUTE_EXACT:
        return True
    return path.startswith(STATIC_ROUTE_PREFIXES)


def init_auth_middleware(app):
    """
    Initialize authentication middleware for the Flask app.

    This runs before every request to validate session and attach user ID.
    REFACTORED: Request-Scoped Session Pattern.
    Keeps DB session open request-wide to prevent DetachedInstanceError.
    """

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        """Close the auth session at the end of the request."""
        db = getattr(g, '_auth_session', None)
        if db is not None:
            db.close()

    @app.before_request
    def authenticate_request():
        """
        Validate session and attach user ID into request context.
        Uses a persistent session (g._auth_session) to keep objects attached.
        """
        # Initialize defaults
        g.user_id = None
        g.session_id = None
        g.user = None
        g.session = None
        g._auth_session = None

        path = request.path

        # Skip auth session checks for static assets served by Flask SPA host.
        if _is_static_asset_request(path):
            return None

        # Check if SAML is configured
        if not saml_auth_service.is_configured():
            return None

        # Get session ID from cookie
        session_id_cookie = request.cookies.get(settings.session_cookie_name)
        if not session_id_cookie:
            # No session cookie - check auth requirements below
            pass
        else:
            # Create a dedicated session for auth that lives for the request
            db = get_db_session()
            g._auth_session = db

            try:
                result = saml_auth_service.validate_session(db, session_id_cookie)
                if result:
                    user, session = result
                    # User remains attached to g._auth_session for duration of request
                    g.user = user
                    g.session = session
                    g.user_id = str(user.id)
                    g.session_id = str(session.id)
                else:
                    logger.debug(f"Invalid session: {session_id_cookie[:8]}...")
            except Exception:
                # If validation fails, ensure we don't hold a bad session
                if g._auth_session:
                    g._auth_session.close()
                    g._auth_session = None
                raise

        # Check strict auth requirements (Authorization Phase)
        # We do this AFTER attempting to load the session so that public routes
        # (like /auth/me) can still access user info if logged in.
        if any(path.startswith(r) for r in PUBLIC_ROUTES):
            return None

        # Protected route without valid session
        if not g.user_id:
            if path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return None

        # Schedule background maintenance tick ONLY for authenticated API traffic.
        if path.startswith("/api/") and getattr(g, "user_id", None):
            schedule_maintenance_tick_if_needed()

        return None


def require_auth(f):
    """
    Decorator to require authentication for a route.

    Use this on routes that absolutely require a logged-in user.
    Returns 401 if no valid session.

    Usage:
        @bp.route("/protected")
        @require_auth
        def protected_route():
            user_id = g.user_id  # Guaranteed to exist
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not getattr(g, "user_id", None):
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated_function


def is_current_user_admin() -> bool:
    """Return True if current authenticated user is an admin.

    Rules:
    - If ADMIN_EMAILS is configured (non-empty), user email must be in allowlist.
    - If ADMIN_EMAILS is empty, allow any authenticated user ONLY in development.
    - If not authenticated, always False.
    """
    if not getattr(g, "user_id", None):
        return False

    user = getattr(g, "user", None)
    user_email = getattr(user, "email", None) if user is not None else None
    email = (user_email or get_current_user_email() or "").strip().lower()
    if not email:
        return False

    env_allowlist = settings.get_admin_emails()
    if env_allowlist:
        return email in env_allowlist

    # No env override: consult DB allowlist (if configured).
    db = getattr(g, "_auth_session", None) or get_db_session()
    close_db = not hasattr(g, "_auth_session") or getattr(g, "_auth_session", None) is None
    try:
        raw = SystemSettingService.get_setting(db, SETTING_ADMIN_EMAILS)
        db_allowlist = settings._parse_admin_emails(raw)
        if db_allowlist:
            return email in db_allowlist
    finally:
        if close_db:
            db.close()

    # Default behavior when no allowlist is configured.
    if settings.is_dev():
        return True
    return False


def require_admin(f):
    """Decorator to require admin access for a route."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not getattr(g, "user_id", None):
            return jsonify({"error": "Authentication required"}), 401

        if not is_current_user_admin():
            return jsonify({"error": "Admin access required"}), 403

        return f(*args, **kwargs)

    return decorated_function


def get_current_user_email() -> str:
    """
    Get current user's email for audit logging.

    Returns "system" if no user is authenticated (e.g., background jobs).

    NOTE: This queries the database to get the email since we only store ID in g.
    """
    from app.database import get_db
    from app.models.user import User

    user_id = getattr(g, "user_id", None)
    if user_id:
        with get_db() as db:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                email = getattr(user, "email", None)
                if email is None:
                    return "system"
                return str(email)
    return "system"
