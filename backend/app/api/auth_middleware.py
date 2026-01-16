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

logger = logging.getLogger(__name__)

# Routes that don't require authentication
PUBLIC_ROUTES = [
    "/auth/",  # All auth routes
    "/health",
    "/api/inflow/webhook",  # Inflow webhook callbacks
    "/api/system/deploy",  # GitHub deploy webhook (has its own signature verification)
]


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

        # Check strict auth requirements first (after init globals)
        path = request.path
        if any(path.startswith(r) for r in PUBLIC_ROUTES):
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

        # Protected route without valid session
        if not g.user_id:
            if path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return None

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
                return user.email
    return "system"
