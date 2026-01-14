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

logger = logging.getLogger(__name__)

# Routes that don't require authentication
PUBLIC_ROUTES = [
    "/auth/",  # All auth routes
    "/health",
    "/api/inflow/webhook",  # Inflow webhook callbacks
]


def init_auth_middleware(app):
    """
    Initialize authentication middleware for the Flask app.

    This runs before every request to validate session and attach user.
    """

    @app.before_request
    def authenticate_request():
        """Validate session and attach user to request context."""
        # Initialize g.user and g.session
        g.user = None
        g.session = None

        # Check if SAML is configured (skip if strictly dev mode without auth)
        if not saml_auth_service.is_configured():
            return None

        # 1. Attempt to validate session from cookie (even for public routes)
        session_id = request.cookies.get(settings.session_cookie_name)
        if session_id:
            with get_db() as db:
                result = saml_auth_service.validate_session(db, session_id)
                if result:
                    user, session = result
                    g.user = user
                    g.session = session
                else:
                    # Invalid/expired session - we don't clear cookie here,
                    # but we won't set g.user.
                    # Logic below decides if this is fatal.
                    logger.debug(f"Invalid session: {session_id[:8]}...")

        # 2. Check strict auth requirements
        path = request.path
        is_public = any(path.startswith(r) for r in PUBLIC_ROUTES)

        # If route is public, we're done (g.user might be set or None)
        if is_public:
            return None

        # If route is protected and we have no user, return 401
        if not g.user:
            if path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            # For non-API routes (if any), could redirect, but frontend handles that
            return None

        return None  # Authenticated and protected, or public


def require_auth(f):
    """
    Decorator to require authentication for a route.

    Use this on routes that absolutely require a logged-in user.
    Returns 401 if no valid session.

    Usage:
        @bp.route("/protected")
        @require_auth
        def protected_route():
            user = g.user  # Guaranteed to exist
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, "user") or not g.user:
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated_function


def get_current_user_email() -> str:
    """
    Get current user's email for audit logging.

    Returns "system" if no user is authenticated (e.g., background jobs).
    """
    if hasattr(g, "user") and g.user:
        return g.user.email
    return "system"
