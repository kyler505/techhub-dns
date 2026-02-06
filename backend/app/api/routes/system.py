"""
System status API routes.

Provides endpoints for checking backend feature statuses.
"""

from flask import Blueprint, jsonify, request
from typing import Dict, Any, cast
from datetime import datetime

from app.config import settings
from app.services.saml_auth_service import saml_auth_service
from app.services.canopy_orders_uploader_service import CanopyOrdersUploaderService
from app.services.graph_service import graph_service
from app.services.inflow_service import InflowService
from app.database import get_db_session
from app.models.system_setting import SystemSetting
from app.models.order import Order
from app.api.auth_middleware import get_current_user_email, require_admin
import logging

bp = Blueprint("system", __name__, url_prefix="/api/system")

logger = logging.getLogger(__name__)

from app.services.system_setting_service import (
    SystemSettingService,
    DEFAULT_SETTINGS,
    SETTING_EMAIL_ENABLED,
    SETTING_TEAMS_RECIPIENT_ENABLED
)

# ============ Settings Endpoints ============

@bp.route("/settings", methods=["GET"])
@require_admin
def get_system_settings():
    """Get all system settings."""
    # SystemSettingService handles its own DB session if not provided
    result = SystemSettingService.get_all_settings()
    return jsonify(result)


@bp.route("/settings/<key>", methods=["PUT"])
@require_admin
def update_system_setting(key: str):
    """Update a system setting."""
    if key not in DEFAULT_SETTINGS:
        return jsonify({"error": f"Unknown setting: {key}"}), 400

    data = request.get_json()
    if not data or "value" not in data:
        return jsonify({"error": "Missing 'value' in request body"}), 400

    updated_by = get_current_user_email()

    # SystemSettingService handles its own DB session
    setting = SystemSettingService.set_setting(key, str(data["value"]), updated_by)

    return jsonify({
        "key": setting.key,
        "value": setting.value,
        "updated_at": setting.updated_at.isoformat() if setting.updated_at is not None else None,
        "updated_by": setting.updated_by,
    })


# ============ Testing Endpoints ============

@bp.route("/test/email", methods=["POST"])
@require_admin
def test_email_notification():
    """Send a test email to verify email configuration."""
    from app.services.email_service import email_service

    data = request.get_json() or {}
    to_address = data.get("to_address")

    if not to_address:
        return jsonify({"error": "Missing 'to_address' in request body"}), 400

    if not email_service.is_configured():
        missing = []
        if not settings.azure_tenant_id: missing.append("AZURE_TENANT_ID")
        if not settings.azure_client_id: missing.append("AZURE_CLIENT_ID")
        if not settings.azure_client_secret: missing.append("AZURE_CLIENT_SECRET")
        if not settings.smtp_from_address: missing.append("SMTP_FROM_ADDRESS")

        return jsonify({
            "success": False,
            "error": f"Email not configured. Missing environment variables: {', '.join(missing)}"
        }), 400

    # Send test email (force=True to bypass enabled check)
    subject = "TechHub DNS - Test Email"
    body_html = """
    <html>
    <body style="font-family: Arial, sans-serif;">
        <h2 style="color: #500000;">Test Email from TechHub</h2>
        <p>This is a test email to verify your email configuration is working correctly.</p>
        <p>If you received this, your SMTP settings are properly configured!</p>
        <hr>
        <p style="font-size: 12px; color: #666;">TechHub Delivery Notification System</p>
    </body>
    </html>
    """
    body_text = "Test Email from TechHub\n\nThis is a test email to verify your email configuration is working correctly."

    success = email_service.send_email(
        to_address=to_address,
        subject=subject,
        body_html=body_html,
        body_text=body_text,
        force=True
    )

    if success:
        return jsonify({"success": True, "message": f"Test email sent to {to_address}"})
    else:
        return jsonify({"success": False, "error": "Failed to send email. Check server logs."}), 500


@bp.route("/test/teams-recipient", methods=["POST"])
@require_admin
def test_teams_recipient():
    """Queue a test Teams notification to a recipient via Graph API."""
    from app.services.teams_recipient_service import teams_recipient_service

    data = request.get_json() or {}
    recipient_email = data.get("recipient_email")
    recipient_name = data.get("recipient_name", "Test User")

    if not recipient_email:
        return jsonify({"error": "Missing 'recipient_email' in request body"}), 400

    if not teams_recipient_service.is_configured():
        # Even if not configured, we might want to try forced send if enabled in settings?
        # Actually is_configured checks settings. Let's send a warning if disabled.
        pass

    try:
        # Send test notification
        success = teams_recipient_service.send_delivery_notification(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            order_number="TEST-123",
            delivery_runner="System Administrator",
            estimated_time="Currently (Test)",
            order_items=["Test Item 1", "Test Item 2"],
            force=True  # Force send even if disabled in settings
        )

        if success:
            return jsonify({"success": True, "message": f"Notification queued for {recipient_email}"})
        else:
            return jsonify({"success": False, "error": "Failed to send Teams message. Check logs."}), 500

    except Exception as e:
        logger.error(f"Teams recipient test failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 500





@bp.route("/test/inflow", methods=["POST"])
@require_admin
def test_inflow_connection():
    """Test connection to Inflow API."""
    service = InflowService()

    try:
        # Try to fetch a small number of orders to verify connection
        orders = service.sync_recent_started_orders_sync(max_pages=1, target_matches=1)
        return jsonify({
            "success": True,
            "message": f"Inflow API connected. Found {len(orders)} order(s) in sample query."
        })
    except Exception as e:
        logger.error(f"Inflow connection test failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@bp.route("/test/sharepoint", methods=["POST"])
@require_admin
def test_sharepoint_connection():
    """Test connection to SharePoint."""
    from app.services.sharepoint_service import get_sharepoint_service

    try:
        sp_service = get_sharepoint_service()

        if not sp_service.is_enabled:
            return jsonify({
                "success": False,
                "error": "SharePoint not enabled. Check SHAREPOINT_ENABLED and Azure configuration."
            }), 400

        # Test authentication and site access
        sp_service._get_access_token()

        return jsonify({
            "success": True,
            "message": f"SharePoint connected. Site: {settings.sharepoint_site_url}"
        })
    except Exception as e:
        logger.error(f"SharePoint connection test failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@bp.route("/status", methods=["GET"])
@require_admin
def get_system_status():
    """
    Get status of all backend features.

    Returns configuration and health status for each feature.
    """
    status = {
        "saml_auth": _get_saml_status(),
        "graph_api": _get_graph_status(),
        "sharepoint": _get_sharepoint_status(),
        "inflow_sync": _get_inflow_sync_status(),

    }

    return jsonify(status)


@bp.route("/sync", methods=["POST"])
@require_admin
def sync_orders():
    """
    Manually trigger order sync from Inflow.
    """
    service = InflowService()

    # Sync recent started orders
    # We use sync version because this is a blocking HTTP request
    from app.database import get_db_session
    db = get_db_session()

    try:
        # First fetch orders from Inflow
        orders = service.sync_recent_started_orders_sync(max_pages=3, target_matches=50)

        # Then create/update them in local DB
        from app.services.order_service import OrderService
        order_service = OrderService(db)

        synced_count = 0
        for order_data in orders:
            try:
                order_service.create_order_from_inflow(order_data)
                synced_count += 1
            except Exception as e:
                # Log but continue
                import logging
                logging.getLogger(__name__).error(f"Failed to sync order {order_data.get('orderNumber')}: {e}")

        return jsonify({
            "success": True,
            "message": f"Synced {synced_count} orders from Inflow",
            "count": synced_count
        })
    finally:
        db.close()


@bp.route("/canopyorders/upload", methods=["POST"])
@require_admin
def upload_canopy_orders():
    data = request.get_json(silent=True) or {}
    orders_payload = data.get("orders")

    if not isinstance(orders_payload, list):
        return jsonify({"error": "Missing 'orders' list in request body"}), 400

    normalized_orders: list[str] = []
    seen_orders: set[str] = set()

    for raw_order in orders_payload:
        if not isinstance(raw_order, str):
            return jsonify({"error": "Each order must be a string"}), 400

        compact = "".join(raw_order.strip().upper().split())
        if not compact:
            return jsonify({"error": "Order number cannot be empty"}), 400

        digits = compact[2:] if compact.startswith("TH") else compact
        if len(digits) != 4 or not digits.isdigit():
            return jsonify({"error": "Order number must be 4 digits (e.g., 1234 or TH1234)"}), 400

        normalized = f"TH{digits}"
        if normalized in seen_orders:
            continue

        seen_orders.add(normalized)
        normalized_orders.append(normalized)

    if not normalized_orders:
        return jsonify({"error": "No orders provided"}), 400

    db = get_db_session()
    try:
        db_orders = (
            db.query(Order)
            .filter(Order.inflow_order_id.in_(normalized_orders))
            .all()
        )
        orders_by_inflow_id: dict[str, Order] = {cast(str, order.inflow_order_id): order for order in db_orders}

        eligible_orders: list[str] = []
        ineligible_orders: list[dict[str, str]] = []
        missing_orders: list[str] = []

        for th in normalized_orders:
            order = orders_by_inflow_id.get(th)
            if not order:
                missing_orders.append(th)
                continue

            status_value = (getattr(order, "status", None) or "").strip()
            if status_value != "picked":
                ineligible_orders.append({"order": th, "reason": f"status={status_value or 'unknown'}"})
                continue

            if getattr(order, "tagged_at", None) is not None:
                ineligible_orders.append({"order": th, "reason": "already tagged"})
                continue

            raw_tag_data = getattr(order, "tag_data", None) or {}
            tag_data = raw_tag_data if isinstance(raw_tag_data, dict) else {}
            already_requested = (
                bool(tag_data.get("canopyorders_request_sent_at"))
                or bool(tag_data.get("tag_request_sent_at"))
                or tag_data.get("tag_request_status") == "sent"
            )
            if already_requested:
                ineligible_orders.append({"order": th, "reason": "already requested"})
                continue

            eligible_orders.append(th)

        if missing_orders or ineligible_orders:
            return (
                jsonify(
                    {
                        "error": "One or more orders are not eligible for upload.",
                        "eligible_orders": eligible_orders,
                        "ineligible_orders": ineligible_orders,
                        "missing_orders": missing_orders,
                    }
                ),
                400,
            )
    finally:
        db.close()

    uploader = CanopyOrdersUploaderService()
    result = uploader.upload_orders(eligible_orders)

    if not result.get("success"):
        response_body = {
            "success": False,
            "filename": result.get("filename"),
            "uploaded_url": result.get("uploaded_url"),
            "count": len(eligible_orders),
            "teams_notified": False,
            "error": result.get("error"),
            "error_type": result.get("error_type"),
            "status_code": result.get("status_code"),
        }
        return jsonify(response_body), 502

    uploaded_url = result.get("uploaded_url")
    teams_notified = False
    if uploaded_url:
        teams_notified = uploader.send_teams_notification(eligible_orders, uploaded_url)

    updated_orders = 0
    db = get_db_session()
    try:
        sent_by = get_current_user_email() or "system"
        sent_at = datetime.utcnow().isoformat()
        request_metadata = {
            "canopyorders_request_sent_at": sent_at,
            "canopyorders_request_filename": result.get("filename"),
            "canopyorders_request_uploaded_url": uploaded_url,
            "canopyorders_request_sent_by": sent_by,
        }

        missing_orders: list[str] = []
        for th in eligible_orders:
            order = db.query(Order).filter(Order.inflow_order_id == th).first()
            if not order:
                missing_orders.append(th)
                continue

            tag_data = dict(cast(dict[str, Any], getattr(order, "tag_data", None) or {}))
            for key, value in request_metadata.items():
                tag_data[key] = value

            setattr(order, "tag_data", tag_data)
            updated_orders += 1

        if updated_orders:
            db.commit()
    finally:
        db.close()

    return jsonify({
        "success": True,
        "filename": result.get("filename"),
        "uploaded_url": uploaded_url,
        "count": len(eligible_orders),
        "teams_notified": teams_notified,
        "updated_orders": updated_orders,
        "missing_orders": missing_orders,
        "eligible_orders": eligible_orders,
        "ineligible_orders": [],
    })


def _normalize_canopyorders_bypass_value(raw_value: str) -> str:
    trimmed = raw_value.strip()
    compact = "".join(trimmed.upper().split())
    if len(compact) == 4 and compact.isdigit():
        return f"TH{compact}"
    if compact.startswith("TH") and len(compact) == 6 and compact[2:].isdigit():
        return f"TH{compact[2:]}"
    return trimmed


def _is_exact_th_order(value: str) -> bool:
    if len(value) != 6:
        return False
    if not value.startswith("TH"):
        return False
    return value[2:].isdigit()


@bp.route("/canopyorders/upload-bypass", methods=["POST"])
@require_admin
def upload_canopy_orders_bypass():
    data = request.get_json(silent=True) or {}
    orders_payload = data.get("orders")

    if not isinstance(orders_payload, list):
        return jsonify({"error": "Missing 'orders' list in request body"}), 400

    normalized_orders: list[str] = []
    seen_orders: set[str] = set()

    for raw_order in orders_payload:
        if not isinstance(raw_order, str):
            return jsonify({"error": "Each order must be a string"}), 400

        if not raw_order.strip():
            return jsonify({"error": "Order number cannot be empty"}), 400

        normalized = _normalize_canopyorders_bypass_value(raw_order)
        if normalized in seen_orders:
            continue

        seen_orders.add(normalized)
        normalized_orders.append(normalized)

    if not normalized_orders:
        return jsonify({"error": "No orders provided"}), 400

    uploader = CanopyOrdersUploaderService()
    result = uploader.upload_orders(normalized_orders)

    if not result.get("success"):
        response_body = {
            "success": False,
            "filename": result.get("filename"),
            "uploaded_url": result.get("uploaded_url"),
            "count": len(normalized_orders),
            "teams_notified": False,
            "updated_orders": 0,
            "missing_orders": [],
            "error": result.get("error"),
            "error_type": result.get("error_type"),
            "status_code": result.get("status_code"),
        }
        return jsonify(response_body), 502

    uploaded_url = result.get("uploaded_url")
    teams_notified = False
    if uploaded_url:
        teams_notified = uploader.send_teams_notification(normalized_orders, uploaded_url)

    updated_orders = 0
    missing_orders: list[str] = []
    th_orders = [order for order in normalized_orders if _is_exact_th_order(order)]

    if th_orders:
        db = get_db_session()
        try:
            sent_by = get_current_user_email() or "system"
            sent_at = datetime.utcnow().isoformat()
            request_metadata = {
                "canopyorders_request_sent_at": sent_at,
                "canopyorders_request_filename": result.get("filename"),
                "canopyorders_request_uploaded_url": uploaded_url,
                "canopyorders_request_sent_by": sent_by,
            }

            for th in th_orders:
                order = db.query(Order).filter(Order.inflow_order_id == th).first()
                if not order:
                    missing_orders.append(th)
                    continue

                tag_data = dict(cast(dict[str, Any], getattr(order, "tag_data", None) or {}))
                for key, value in request_metadata.items():
                    tag_data[key] = value
                setattr(order, "tag_data", tag_data)
                updated_orders += 1

            if updated_orders:
                try:
                    db.commit()
                except Exception:
                    logger.exception("Failed to persist CanopyOrders bypass request metadata")
                    db.rollback()
                    updated_orders = 0
        finally:
            db.close()

    return jsonify({
        "success": True,
        "filename": result.get("filename"),
        "uploaded_url": uploaded_url,
        "count": len(normalized_orders),
        "teams_notified": teams_notified,
        "updated_orders": updated_orders,
        "missing_orders": missing_orders,
    })


@bp.route("/deploy", methods=["POST"])
def deploy_webhook():
    """
    Deprecated.

    This endpoint previously handled GitHub webhook-based auto-deploy.
    Auto-deploy now runs via GitHub Actions (SSH) and this route is intentionally disabled.
    """
    logger.warning("Deprecated deploy endpoint hit from %s", request.remote_addr)
    return (
        jsonify(
            {
                "error": "Deploy webhook removed",
                "message": "Automated deploy now runs via GitHub Actions. See docs/setup/deployment.md.",
            }
        ),
        410,
    )


def _get_saml_status():
    """Get SAML authentication status."""
    enabled = settings.saml_enabled
    configured = saml_auth_service.is_configured()

    if not enabled:
        return {
            "name": "TAMU SSO",
            "enabled": False,
            "configured": False,
            "status": "disabled",
            "details": "SAML authentication disabled",
        }

    if not configured:
        return {
            "name": "TAMU SSO",
            "enabled": True,
            "configured": False,
            "status": "warning",
            "details": "SAML enabled but missing configuration",
        }

    return {
        "name": "TAMU SSO",
        "enabled": True,
        "configured": True,
        "status": "active",
        "details": f"Entity: {settings.saml_sp_entity_id}",
    }


def _get_graph_status():
    """Get Microsoft Graph API status with actual connection test."""
    import logging

    logger = logging.getLogger(__name__)

    configured = graph_service.is_configured()

    if not configured:
        return {
            "name": "Microsoft Graph",
            "enabled": False,
            "configured": False,
            "status": "disabled",
            "details": "Service Principal not configured (AZURE_* env vars)",
        }

    # Try to actually test the authentication
    try:
        # Test getting an access token
        token = graph_service._get_access_token()
        if token:
            return {
                "name": "Microsoft Graph",
                "enabled": True,
                "configured": True,
                "status": "active",
                "details": "Service Principal authenticated",
            }
    except Exception as e:
        error_str = str(e)
        logger.error(f"Graph API status check failed: {error_str}")

        # Parse common Azure AD errors
        if "AADSTS" in error_str:
            if "AADSTS7000215" in error_str:
                return {
                    "name": "Microsoft Graph",
                    "enabled": True,
                    "configured": True,
                    "status": "error",
                    "details": "Invalid client secret",
                    "error": "The client secret is invalid or expired",
                }
            elif "AADSTS700016" in error_str:
                return {
                    "name": "Microsoft Graph",
                    "enabled": True,
                    "configured": True,
                    "status": "error",
                    "details": "App not found in tenant",
                    "error": "Application ID not found in the directory",
                }
            elif "AADSTS65001" in error_str:
                return {
                    "name": "Microsoft Graph",
                    "enabled": True,
                    "configured": True,
                    "status": "warning",
                    "details": "Pending admin consent",
                    "error": "Admin consent required for API permissions",
                }
            elif "AADSTS70011" in error_str:
                return {
                    "name": "Microsoft Graph",
                    "enabled": True,
                    "configured": True,
                    "status": "error",
                    "details": "Invalid scope",
                    "error": "The requested scope is invalid or not configured",
                }
            else:
                return {
                    "name": "Microsoft Graph",
                    "enabled": True,
                    "configured": True,
                    "status": "error",
                    "details": "Azure AD error",
                    "error": error_str[:100],
                }
        else:
            return {
                "name": "Microsoft Graph",
                "enabled": True,
                "configured": True,
                "status": "error",
                "details": "Authentication failed",
                "error": error_str[:100],
            }

    # Shouldn't reach here, but fallback
    return {
        "name": "Microsoft Graph",
        "enabled": True,
        "configured": True,
        "status": "warning",
        "details": "Status unknown",
    }


def _get_sharepoint_status():
    """Get SharePoint storage status with actual connection test."""
    from app.services.sharepoint_service import get_sharepoint_service
    import logging

    logger = logging.getLogger(__name__)

    # Check basic configuration
    graph_configured = graph_service.is_configured()
    site_configured = bool(settings.sharepoint_site_url)

    if not graph_configured:
        return {
            "name": "SharePoint Storage",
            "enabled": False,
            "configured": False,
            "status": "disabled",
            "details": "Requires Azure Service Principal (AZURE_* env vars)",
        }

    if not site_configured:
        return {
            "name": "SharePoint Storage",
            "enabled": True,
            "configured": False,
            "status": "warning",
            "details": "Service Principal ready, site URL not set",
        }

    # Try to actually test the connection
    try:
        sp_service = get_sharepoint_service()

        # Check if we've already successfully authenticated
        if sp_service._site_id:
            return {
                "name": "SharePoint Storage",
                "enabled": True,
                "configured": True,
                "status": "active",
                "details": f"Connected to {settings.sharepoint_site_url}",
            }

        # Try to get an access token (tests MSAL auth without making Graph calls)
        try:
            sp_service._get_access_token()
            return {
                "name": "SharePoint Storage",
                "enabled": True,
                "configured": True,
                "status": "active",
                "details": f"Authenticated, site: {settings.sharepoint_site_url}",
            }
        except Exception as auth_error:
            error_str = str(auth_error)
            # Check for common permission issues
            if "AADSTS" in error_str:
                if "AADSTS7000215" in error_str:
                    return {
                        "name": "SharePoint Storage",
                        "enabled": True,
                        "configured": True,
                        "status": "error",
                        "details": "Invalid client secret",
                        "error": "The client secret is invalid or expired",
                    }
                elif "AADSTS700016" in error_str:
                    return {
                        "name": "SharePoint Storage",
                        "enabled": True,
                        "configured": True,
                        "status": "error",
                        "details": "App not found in tenant",
                        "error": "Application ID not found in the directory",
                    }
                elif "AADSTS65001" in error_str:
                    return {
                        "name": "SharePoint Storage",
                        "enabled": True,
                        "configured": True,
                        "status": "warning",
                        "details": "Pending admin consent",
                        "error": "Admin consent required for API permissions",
                    }
                else:
                    return {
                        "name": "SharePoint Storage",
                        "enabled": True,
                        "configured": True,
                        "status": "error",
                        "details": "Azure AD error",
                        "error": error_str[:100],
                    }
            else:
                return {
                    "name": "SharePoint Storage",
                    "enabled": True,
                    "configured": True,
                    "status": "error",
                    "details": "Authentication failed",
                    "error": error_str[:100],
                }

    except Exception as e:
        logger.error(f"SharePoint status check failed: {e}")
        return {
            "name": "SharePoint Storage",
            "enabled": True,
            "configured": True,
            "status": "error",
            "details": "Connection test failed",
            "error": str(e)[:100],
        }


def _get_inflow_sync_status():
    """Get Inflow polling sync status."""
    enabled = settings.inflow_polling_sync_enabled
    api_key = bool(settings.inflow_api_key)

    if not api_key:
        return {
            "name": "Inflow Sync",
            "enabled": False,
            "configured": False,
            "status": "disabled",
            "details": "Inflow API key not configured",
        }

    if not enabled:
        return {
            "name": "Inflow Sync",
            "enabled": False,
            "configured": True,
            "status": "disabled",
            "details": "Polling sync disabled (using webhooks only)",
        }

    interval = settings.inflow_polling_sync_interval_minutes or 5
    return {
        "name": "Inflow Sync",
        "enabled": True,
        "configured": True,
        "status": "active",
        "details": f"Polling every {interval} minutes",
    }
