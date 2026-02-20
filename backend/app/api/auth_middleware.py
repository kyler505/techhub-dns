"""
Authentication middleware.

Validates session cookies and attaches user to request context.
"""

import logging
from functools import wraps
from flask import request, g, jsonify

from app.config import settings
from app.database import get_db
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

    This runs before every request to validate session and attach auth context.
    Uses short-lived DB sessions to avoid request-wide connection retention.
    """

    @app.before_request
    def authenticate_request():
        """
        Validate session and attach lightweight auth context into request scope.
        """
        # Initialize defaults
        g.user_id = None
        g.session_id = None
        g.user_email = None
        g.user_data = None
        g.session_data = None

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
            with get_db() as db:
                result = saml_auth_service.validate_session(db, session_id_cookie)
                if result:
                    user, session = result
                    g.user_id = str(user.id)
                    g.session_id = str(session.id)
                    g.user_email = str(user.email) if user.email else None
                    g.user_data = user.to_dict()
                    g.session_data = session.to_dict()
                else:
                    logger.debug(f"Invalid session: {session_id_cookie[:8]}...")

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

    email = (getattr(g, "user_email", None) or get_current_user_email() or "").strip().lower()
    if not email:
        return False

    env_allowlist = settings.get_admin_emails()
    if env_allowlist:
        return email in env_allowlist

    # No env override: consult DB allowlist (if configured).
    with get_db() as db:
        raw = SystemSettingService.get_setting(db, SETTING_ADMIN_EMAILS)
        db_allowlist = settings._parse_admin_emails(raw)
        if db_allowlist:
            return email in db_allowlist

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

    Prefers middleware-provided email and falls back to a short DB lookup.
    """
    from app.models.user import User

    user_email = getattr(g, "user_email", None)
    if user_email:
        return str(user_email)

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
