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
from app.database import get_db, get_db_session
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

    This runs before every request to validate session and attach user.
    """

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        """Close the auth session at the end of the request."""
        db = getattr(g, '_auth_session', None)
        if db is not None:
            # Expunge user and session objects from session before closing
            # This allows them to be accessed after the session is closed
            if hasattr(g, 'user') and g.user is not None:
                try:
                    db.expunge(g.user)
                except:
                    pass
            if hasattr(g, 'session') and g.session is not None:
                try:
                    db.expunge(g.session)
                except:
                    pass
            db.close()

    @app.before_request
    def authenticate_request():
        """Validate session and attach user to request context."""
        # #region agent log
        try:
            with open(DEBUG_LOG_PATH, 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"E","location":"auth_middleware.py:40","message":"authenticate_request entry","data":{"path":request.path},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        try:
            # Initialize g.user and g.session
            g.user = None
            g.session = None

            # Check if SAML is configured (skip if strictly dev mode without auth)
            # #region agent log
            try:
                is_configured = saml_auth_service.is_configured()
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth_middleware.py:48","message":"SAML configured check","data":{"is_configured":is_configured},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except Exception as e:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth_middleware.py:48","message":"SAML configured check failed","data":{"error":str(e)},"timestamp":int(__import__('time').time()*1000)})+'\n')
                raise
            # #endregion
            if not is_configured:
                return None

            # 1. Attempt to validate session from cookie (even for public routes)
            session_id = request.cookies.get(settings.session_cookie_name)
            # #region agent log
            try:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"B","location":"auth_middleware.py:55","message":"session_id from cookie","data":{"has_session_id":session_id is not None,"session_id_prefix":session_id[:8] if session_id else None},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except: pass
            # #endregion
            if session_id:
                # #region agent log
                try:
                    with open(DEBUG_LOG_PATH, 'a') as f:
                        f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth_middleware.py:58","message":"before get_db_session","data":{},"timestamp":int(__import__('time').time()*1000)})+'\n')
                except: pass
                # #endregion
                # Create a dedicated session for auth that lives for the request
                try:
                    db = get_db_session()
                    # #region agent log
                    try:
                        with open(DEBUG_LOG_PATH, 'a') as f:
                            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth_middleware.py:62","message":"get_db_session success","data":{"db_type":type(db).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
                    except: pass
                    # #endregion
                    g._auth_session = db
                except Exception as e:
                    # #region agent log
                    try:
                        with open(DEBUG_LOG_PATH, 'a') as f:
                            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth_middleware.py:64","message":"get_db_session failed","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
                    except: pass
                    # #endregion
                    raise

                # #region agent log
                try:
                    with open(DEBUG_LOG_PATH, 'a') as f:
                        f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"B","location":"auth_middleware.py:68","message":"before validate_session","data":{},"timestamp":int(__import__('time').time()*1000)})+'\n')
                except: pass
                # #endregion
                try:
                    result = saml_auth_service.validate_session(db, session_id)
                    # #region agent log
                    try:
                        with open(DEBUG_LOG_PATH, 'a') as f:
                            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"B","location":"auth_middleware.py:71","message":"validate_session result","data":{"has_result":result is not None,"result_type":type(result).__name__ if result else None},"timestamp":int(__import__('time').time()*1000)})+'\n')
                    except: pass
                    # #endregion
                    if result:
                        user, session = result
                        # #region agent log
                        try:
                            with open(DEBUG_LOG_PATH, 'a') as f:
                                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth_middleware.py:75","message":"setting g.user and g.session","data":{"user_id":str(user.id) if hasattr(user,"id") else None,"session_id":str(session.id) if hasattr(session,"id") else None},"timestamp":int(__import__('time').time()*1000)})+'\n')
                        except: pass
                        # #endregion
                        # User remains attached to g._auth_session for the duration of request
                        g.user = user
                        g.session = session
                    else:
                        # Invalid/expired session - we don't clear cookie here,
                        # but we won't set g.user.
                        # Logic below decides if this is fatal.
                        logger.debug(f"Invalid session: {session_id[:8]}...")
                except Exception as e:
                    # #region agent log
                    try:
                        with open(DEBUG_LOG_PATH, 'a') as f:
                            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"B","location":"auth_middleware.py:85","message":"validate_session exception","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
                    except: pass
                    # #endregion
                    raise

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
        except Exception as e:
            # #region agent log
            try:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"E","location":"auth_middleware.py:100","message":"authenticate_request exception","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except: pass
            # #endregion
            raise


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
