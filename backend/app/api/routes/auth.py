"""
Authentication API routes.

Provides endpoints for SAML login/logout and session management.
"""

import logging
from datetime import datetime
from flask import Blueprint, request, redirect, make_response, jsonify, g

from app.config import settings
from app.database import get_db
from app.services.saml_auth_service import saml_auth_service
from app.api.auth_middleware import is_current_user_admin

logger = logging.getLogger(__name__)

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

    REFACTORED: Query fresh from database using properly scoped session.
    Middleware now stores only IDs, avoiding DetachedInstanceError.
    """
    # Check if user is authenticated (middleware sets g.user_id)
    user_id = getattr(g, 'user_id', None)
    session_id = getattr(g, 'session_id', None)

    if not user_id:
        # Not authenticated - return null (not 401, let frontend handle redirect)
        return jsonify({"user": None, "session": None, "is_admin": False})

    middleware_user = getattr(g, "user", None)
    middleware_session = getattr(g, "session", None)
    if middleware_user is not None:
        return jsonify({
            "user": middleware_user.to_dict(),
            "session": middleware_session.to_dict() if middleware_session is not None else None,
            "is_admin": is_current_user_admin(),
        })

    # Query fresh from database using properly scoped session
    from app.models.user import User
    from app.models.session import Session

    with get_db() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"user": None, "session": None, "is_admin": False})

        # Build user dict while session is open - no detached instance issues
        user_dict = user.to_dict()

        # Get session if available
        session_dict = None
        if session_id:
            session_obj = db.query(Session).filter(Session.id == session_id).first()
            if session_obj:
                session_dict = session_obj.to_dict()

    return jsonify({
        "user": user_dict,
        "session": session_dict,
        "is_admin": is_current_user_admin(),
    })


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
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    current_session_id = request.cookies.get(settings.session_cookie_name)

    with get_db() as db:
        sessions = saml_auth_service.get_user_sessions(db, user_id)
        result = []
        for s in sessions:
            if s.is_valid():
                session_dict = s.to_dict()
                session_dict["is_current"] = (s.id == current_session_id)
                result.append(session_dict)

    return jsonify({"sessions": result})


@bp.route("/sessions/revoke", methods=["POST"])
def revoke_session():
    """
    Revoke a specific session.
    """
    user_id = getattr(g, 'user_id', None)
    if not user_id:
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
            Session.user_id == user_id
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
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    current_session_id = request.cookies.get(settings.session_cookie_name)

    with get_db() as db:
        count = saml_auth_service.revoke_all_sessions(
            db,
            user_id,
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
