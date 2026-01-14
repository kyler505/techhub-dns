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

        # Skip auth for public routes
        path = request.path
        for public_route in PUBLIC_ROUTES:
            if path.startswith(public_route):
                return None  # Continue to route handler

        # Skip auth if SAML is not configured (dev mode without auth)
        if not saml_auth_service.is_configured():
            return None

        # Get session from cookie
        session_id = request.cookies.get(settings.session_cookie_name)
        if not session_id:
            # No session - for API routes, return 401
            # For page routes, they'll redirect via frontend
            if path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return None

        # Validate session
        with get_db() as db:
            result = saml_auth_service.validate_session(db, session_id)
            if result:
                user, session = result
                g.user = user
                g.session = session
            else:
                # Invalid/expired session - clear cookie
                logger.debug(f"Invalid session: {session_id[:8]}...")
                if path.startswith("/api/"):
                    return jsonify({"error": "Session expired"}), 401

        return None  # Continue to route handler


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
