"""
Authentication middleware.

Validates session cookies and attaches user to request context.
"""

import logging
import json
import os
from functools import wraps
from flask import request, g, jsonify

from app.config import settings
from app.database import get_db
from app.services.saml_auth_service import saml_auth_service

logger = logging.getLogger(__name__)

# #region agent log
# Cross-platform log path: go up from backend/app/api/auth_middleware.py to project root
# backend/app/api/auth_middleware.py -> backend/app/api -> backend/app -> backend -> project_root
_workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEBUG_LOG_PATH = os.path.join(_workspace_root, '.cursor', 'debug.log')
# Ensure directory exists
os.makedirs(os.path.dirname(DEBUG_LOG_PATH), exist_ok=True)
# #endregion

# Routes that don't require authentication
PUBLIC_ROUTES = [
    "/auth/",  # All auth routes
    "/health",
    "/api/inflow/webhook",  # Inflow webhook callbacks
]


def init_auth_middleware(app):
    """
    Initialize authentication middleware for the Flask app.

    This runs before every request to validate session and attach user ID.
    REFACTORED: No longer stores ORM objects, only IDs - no teardown needed.
    """

    @app.before_request
    def authenticate_request():
        """
        Validate session and attach user ID to request context.
        
        REFACTORED: Store only IDs (strings) in g, not ORM objects.
        This avoids DetachedInstanceError - routes query fresh from DB when needed.
        """
        # #region agent log
        try:
            with open(DEBUG_LOG_PATH, 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"F","location":"auth_middleware.py:54","message":"authenticate_request entry (refactored)","data":{"path":request.path},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        
        # Initialize with None - routes check these IDs
        g.user_id = None
        g.session_id = None
        # Legacy compatibility - some routes may still check g.user
        g.user = None
        g.session = None
        
        # Check if SAML is configured
        if not saml_auth_service.is_configured():
            return None
        
        # Get session ID from cookie
        session_id_cookie = request.cookies.get(settings.session_cookie_name)
        if not session_id_cookie:
            # No session cookie - check auth requirements below
            pass
        else:
            # Validate session using a short-lived DB session
            with get_db() as db:
                result = saml_auth_service.validate_session(db, session_id_cookie)
                if result:
                    user, session = result
                    # Store only IDs - routes will query fresh when needed
                    g.user_id = str(user.id)
                    g.session_id = str(session.id)
                    # #region agent log
                    try:
                        with open(DEBUG_LOG_PATH, 'a') as f:
                            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"F","location":"auth_middleware.py:80","message":"session validated, storing IDs only","data":{"user_id":g.user_id,"session_id":g.session_id[:8] if g.session_id else None},"timestamp":int(__import__('time').time()*1000)})+'\n')
                    except: pass
                    # #endregion
                else:
                    logger.debug(f"Invalid session: {session_id_cookie[:8]}...")
        
        # Check strict auth requirements
        path = request.path
        is_public = any(path.startswith(r) for r in PUBLIC_ROUTES)
        
        if is_public:
            return None
        
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
