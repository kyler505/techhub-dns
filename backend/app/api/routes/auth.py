"""
Authentication API routes.

Provides endpoints for SAML login/logout and session management.
"""

import logging
from flask import Blueprint, request, redirect, make_response, jsonify, g

from app.config import settings
from app.database import get_db
from app.services.saml_auth_service import saml_auth_service

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

        # Create response with session cookie
        response = make_response(redirect(relay_state))
        response.set_cookie(
            settings.session_cookie_name,
            session.id,
            max_age=settings.session_max_age_hours * 3600,
            httponly=True,
            secure=settings.flask_env != "development",
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
    if not hasattr(g, "user") or not g.user:
        # Return OK with null user to avoid 401 console errors on startup
        return jsonify({"user": None, "session": None})

    return jsonify({
        "user": g.user.to_dict(),
        "session": g.session.to_dict() if hasattr(g, "session") and g.session else None,
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
    """
    url_data = request.url.split("?")

    # PythonAnywhere (and other proxies) send X-Forwarded-Proto
    # We must explicitly check this because python3-saml validates the destination URL
    forwarded_proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    is_https = forwarded_proto == "https" or request.scheme == "https"

    return {
        "https": "on" if is_https else "off",
        "http_host": request.host,
        "server_port": request.environ.get("SERVER_PORT", "443" if is_https else "80"),
        "script_name": request.path,
        "get_data": request.args.copy(),
        "post_data": request.form.copy(),
        "query_string": request.query_string.decode("utf-8"),
    }
