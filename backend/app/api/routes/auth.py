"""
Authentication API routes.

Provides endpoints for SAML login/logout and session management.
"""

import logging
import json
import os
from flask import Blueprint, request, redirect, make_response, jsonify, g

from app.config import settings
from app.database import get_db
from app.services.saml_auth_service import saml_auth_service

logger = logging.getLogger(__name__)

# #region agent log
# Cross-platform log path: go up from backend/app/api/routes/auth.py to project root
# backend/app/api/routes/auth.py -> backend/app/api/routes -> backend/app/api -> backend/app -> backend -> project_root
_workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
DEBUG_LOG_PATH = os.path.join(_workspace_root, '.cursor', 'debug.log')
# Ensure directory exists
os.makedirs(os.path.dirname(DEBUG_LOG_PATH), exist_ok=True)
# #endregion

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/saml/login", methods=["GET"])
def saml_login():
    """
    Initiate SAML login flow.

    Redirects user to TAMU Entra ID login page.
    """
    if not saml_auth_service.is_configured():
        return jsonify({"error": "SAML not configured"}), 503

    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth

        # Prepare request for python3-saml
        req = _prepare_flask_request()
        auth = OneLogin_Saml2_Auth(req, saml_auth_service.get_saml_settings())

        # Get the redirect URL with optional RelayState
        relay_state = request.args.get("next", "/")
        redirect_url = auth.login(return_to=relay_state)

        return redirect(redirect_url)
    except Exception as e:
        logger.exception(f"SAML login error: {e}")
        return jsonify({"error": "Failed to initiate login"}), 500


@bp.route("/saml/callback", methods=["POST"])
def saml_callback():
    """
    Handle SAML response from IdP.

    Validates the SAML assertion, creates/updates user, creates session,
    and sets session cookie.
    """
    if not saml_auth_service.is_configured():
        return jsonify({"error": "SAML not configured"}), 503

    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth

        req = _prepare_flask_request()
        auth = OneLogin_Saml2_Auth(req, saml_auth_service.get_saml_settings())

        # Process the SAML response
        auth.process_response()
        errors = auth.get_errors()

        if errors:
            logger.error(f"SAML errors: {errors}")
            logger.error(f"SAML last error reason: {auth.get_last_error_reason()}")
            return jsonify({"error": "Authentication failed", "details": errors}), 401

        if not auth.is_authenticated():
            reason = auth.get_last_error_reason()
            logger.error(f"SAML authentication failed: {errors}")
            logger.error(f"Failure reason: {reason}")
            return jsonify({
                "error": "Authentication failed",
                "details": errors,
                "reason": reason
            }), 401

        # Extract SAML attributes
        saml_attributes = auth.get_attributes()
        name_id = auth.get_nameid()

        logger.info(f"SAML login successful for: {name_id}")
        logger.debug(f"SAML attributes: {saml_attributes}")

        # Create/update user and session
        with get_db() as db:
            user = saml_auth_service.get_or_create_user(db, saml_attributes)
            session = saml_auth_service.create_session(
                db,
                user,
                user_agent=request.headers.get("User-Agent"),
                ip_address=request.remote_addr,
            )

        # Get redirect target from RelayState
        relay_state = request.form.get("RelayState", "/")
        if not relay_state or relay_state == "None":
            relay_state = "/"
        # Prevent redirect loop - don't redirect back to login page after successful auth
        if relay_state == "/login" or relay_state.startswith("/login?"):
            relay_state = "/"

        # Create response with session cookie
        response = make_response(redirect(relay_state))

        # Determine if secure cookie (HTTPS)
        is_secure = settings.flask_env != "development"

        # Debug logging for cookie setting
        logger.info(f"Setting session cookie: name={settings.session_cookie_name}, "
                    f"session_id={session.id[:8]}..., secure={is_secure}, "
                    f"flask_env={settings.flask_env}, relay_state={relay_state}")

        response.set_cookie(
            settings.session_cookie_name,
            session.id,
            max_age=settings.session_max_age_hours * 3600,
            httponly=True,
            secure=is_secure,
            samesite="Lax",
        )

        return response

    except Exception as e:
        logger.exception(f"SAML callback error: {e}")
        return jsonify({"error": "Authentication processing failed"}), 500


@bp.route("/me", methods=["GET"])
def get_current_user():
    """
    Get current authenticated user.

    Returns user info if authenticated, 401 otherwise.
    """
    # #region agent log
    try:
        with open(DEBUG_LOG_PATH, 'a') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth.py:135","message":"get_current_user entry","data":{"has_g_user":hasattr(g,"user")},"timestamp":int(__import__('time').time()*1000)})+'\n')
    except: pass
    # #endregion
    try:
        # #region agent log
        try:
            with open(DEBUG_LOG_PATH, 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth.py:141","message":"before g.user check","data":{"hasattr_g_user":hasattr(g,"user"),"g_user_exists":hasattr(g,"user") and g.user is not None},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        if not hasattr(g, "user") or not g.user:
            # #region agent log
            try:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth.py:143","message":"no user found, returning null","data":{},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except: pass
            # #endregion
            # Return OK with null user to avoid 401 console errors on startup
            return jsonify({"user": None, "session": None})

        # #region agent log
        try:
            with open(DEBUG_LOG_PATH, 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth.py:149","message":"before serialization","data":{"has_session":hasattr(g,"session"),"session_exists":hasattr(g,"session") and g.session is not None,"user_type":type(g.user).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        # Manually construct dictionaries to avoid DetachedInstanceError
        # Access ALL attributes immediately while session is definitely open
        # Store in local variables so we don't need SQLAlchemy attribute access later
        db = getattr(g, '_auth_session', None)
        if db is None:
            # No session - this shouldn't happen but handle gracefully
            logger.error("No auth session found when trying to serialize user")
            return jsonify({"user": None, "session": None})
        
        # #region agent log
        try:
            with open(DEBUG_LOG_PATH, 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth.py:163","message":"accessing all attributes while session open","data":{},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        
        # Access all user attributes immediately while session is open
        # Store in local variables to avoid any SQLAlchemy attribute access later
        try:
            user_id = g.user.id
            user_email = g.user.email
            user_display_name = g.user.display_name
            user_department = g.user.department
            user_created_at = g.user.created_at
            user_last_login_at = g.user.last_login_at
            # #region agent log
            try:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth.py:175","message":"user attributes accessed successfully","data":{},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except: pass
            # #endregion
        except Exception as e:
            # #region agent log
            try:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth.py:180","message":"user attribute access failed","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except: pass
            # #endregion
            raise
        
        # Build user dict from local variables (no SQLAlchemy access needed)
        try:
            user_dict = {
                "id": user_id,
                "email": user_email,
                "display_name": user_display_name,
                "department": user_department,
                "created_at": user_created_at.isoformat() if user_created_at else None,
                "last_login_at": user_last_login_at.isoformat() if user_last_login_at else None,
            }
            # #region agent log
            try:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"auth.py:175","message":"user dict built successfully","data":{"user_dict_keys":list(user_dict.keys())},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except: pass
            # #endregion
        except Exception as e:
            # #region agent log
            try:
                with open(DEBUG_LOG_PATH, 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"auth.py:179","message":"user dict build failed","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
            except: pass
            # #endregion
            raise

        # Access all session attributes immediately while session is open
        # Store in local variables to avoid any SQLAlchemy attribute access later
        session_dict = None
        if hasattr(g, "session") and g.session:
            try:
                session_id = g.session.id
                session_created_at = g.session.created_at
                session_expires_at = g.session.expires_at
                session_last_seen_at = g.session.last_seen_at
                session_user_agent = g.session.user_agent
                session_ip_address = g.session.ip_address
                # #region agent log
                try:
                    with open(DEBUG_LOG_PATH, 'a') as f:
                        f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth.py:205","message":"session attributes accessed successfully","data":{},"timestamp":int(__import__('time').time()*1000)})+'\n')
                except: pass
                # #endregion
            except Exception as e:
                # #region agent log
                try:
                    with open(DEBUG_LOG_PATH, 'a') as f:
                        f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"auth.py:210","message":"session attribute access failed","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
                except: pass
                # #endregion
                # Session dict is optional, so log but don't fail
                logger.warning(f"Failed to access session attributes: {e}")
            else:
                # Build session dict from local variables (no SQLAlchemy access needed)
                session_dict = {
                    "id": session_id,
                    "created_at": session_created_at.isoformat() if session_created_at else None,
                    "expires_at": session_expires_at.isoformat() if session_expires_at else None,
                    "last_seen_at": session_last_seen_at.isoformat() if session_last_seen_at else None,
                    "user_agent": session_user_agent,
                    "ip_address": session_ip_address,
                    "is_current": False,
                }
                # #region agent log
                try:
                    with open(DEBUG_LOG_PATH, 'a') as f:
                        f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"auth.py:194","message":"session dict built successfully","data":{"session_dict_keys":list(session_dict.keys())},"timestamp":int(__import__('time').time()*1000)})+'\n')
                except: pass
                # #endregion
            except Exception as e:
                # #region agent log
                try:
                    with open(DEBUG_LOG_PATH, 'a') as f:
                        f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"auth.py:198","message":"session dict build failed","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
                except: pass
                # #endregion
                # Session dict is optional, so log but don't fail
                logger.warning(f"Failed to build session dict: {e}")

        return jsonify({
            "user": user_dict,
            "session": session_dict,
        })
    except Exception as e:
        # #region agent log
        try:
            with open(DEBUG_LOG_PATH, 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"auth.py:225","message":"get_current_user exception","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        # Log the full exception for debugging
        logger.exception(f"Error in get_current_user: {e}")
        # Re-raise to let Flask error handler deal with it
        raise


@bp.route("/logout", methods=["POST"])
def logout():
    """
    Log out current session.

    Revokes the current session and clears the cookie.
    """
    session_id = request.cookies.get(settings.session_cookie_name)

    if session_id:
        with get_db() as db:
            saml_auth_service.revoke_session(db, session_id)

    response = make_response(jsonify({"message": "Logged out"}))
    response.delete_cookie(settings.session_cookie_name)

    return response


@bp.route("/sessions", methods=["GET"])
def list_sessions():
    """
    List all active sessions for the current user.
    """
    if not hasattr(g, "user") or not g.user:
        return jsonify({"error": "Not authenticated"}), 401

    current_session_id = request.cookies.get(settings.session_cookie_name)

    with get_db() as db:
        sessions = saml_auth_service.get_user_sessions(db, g.user.id)
        result = []
        for s in sessions:
            session_dict = s.to_dict()
            session_dict["is_current"] = (s.id == current_session_id)
            result.append(session_dict)

    return jsonify({"sessions": result})


@bp.route("/sessions/revoke", methods=["POST"])
def revoke_session():
    """
    Revoke a specific session.
    """
    if not hasattr(g, "user") or not g.user:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json()
    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"error": "session_id required"}), 400

    with get_db() as db:
        # Verify session belongs to user
        from app.models.session import Session
        session = db.query(Session).filter(
            Session.id == session_id,
            Session.user_id == g.user.id
        ).first()

        if not session:
            return jsonify({"error": "Session not found"}), 404

        saml_auth_service.revoke_session(db, session_id)

    return jsonify({"message": "Session revoked"})


@bp.route("/sessions/revoke_all", methods=["POST"])
def revoke_all_sessions():
    """
    Revoke all sessions except current one (sign out everywhere else).
    """
    if not hasattr(g, "user") or not g.user:
        return jsonify({"error": "Not authenticated"}), 401

    current_session_id = request.cookies.get(settings.session_cookie_name)

    with get_db() as db:
        count = saml_auth_service.revoke_all_sessions(
            db,
            g.user.id,
            except_session_id=current_session_id
        )

    return jsonify({"message": f"Revoked {count} sessions"})


def _prepare_flask_request():
    """
    Prepare request dict for python3-saml from Flask request.

    IMPORTANT: python3-saml uses these values to compute the "received at" URL
    when validating the SAML response's Destination attribute. The library
    constructs the URL as: {https}://{http_host}{script_name}

    NOTE: Do NOT pass server_port explicitly when behind a reverse proxy.
    This causes issues with URL computation. Let the library determine port from http_host.
    See: https://github.com/onelogin/python3-saml/issues/
    """
    # PythonAnywhere (and other proxies) send X-Forwarded-Proto
    # We must explicitly check this because python3-saml validates the destination URL
    forwarded_proto = request.headers.get("X-Forwarded-Proto", request.scheme)

    # CRITICAL: PythonAnywhere internal proxy sends X-Forwarded-Proto: http even for HTTPS
    # We force HTTPS for pythonanywhere.com hosts since they are always served over HTTPS externally
    host = request.host.lower()
    is_pythonanywhere = "pythonanywhere.com" in host
    is_https = is_pythonanywhere or forwarded_proto.lower() == "https" or request.scheme == "https"

    # Log the detected protocol for debugging
    logger.info(f"Preparing SAML request. is_https={is_https}, is_pythonanywhere={is_pythonanywhere}, "
                f"forwarded_proto={forwarded_proto}, host={host}")

    # Return SAML request dict - do NOT include server_port to avoid proxy issues
    return {
        "https": "on" if is_https else "off",
        "http_host": request.host,
        "script_name": request.path,
        "get_data": request.args.copy(),
        "post_data": request.form.copy(),
        "query_string": request.query_string.decode("utf-8"),
    }
