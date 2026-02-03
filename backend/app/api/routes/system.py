"""
System status API routes.

Provides endpoints for checking backend feature statuses.
"""

from flask import Blueprint, jsonify, request
from typing import Dict, Any

from app.config import settings
from app.services.saml_auth_service import saml_auth_service
from app.services.graph_service import graph_service
from app.services.inflow_service import InflowService
from app.services.canopy_orders_uploader_service import CanopyOrdersUploaderService
from app.database import get_db_session
from app.models.system_setting import SystemSetting
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
def get_system_settings():
    """Get all system settings."""
    # SystemSettingService handles its own DB session if not provided
    result = SystemSettingService.get_all_settings()
    return jsonify(result)


@bp.route("/settings/<key>", methods=["PUT"])
def update_system_setting(key: str):
    """Update a system setting."""
    if key not in DEFAULT_SETTINGS:
        return jsonify({"error": f"Unknown setting: {key}"}), 400

    data = request.get_json()
    if not data or "value" not in data:
        return jsonify({"error": "Missing 'value' in request body"}), 400

    updated_by = data.get("updated_by", "admin")

    # SystemSettingService handles its own DB session
    setting = SystemSettingService.set_setting(key, str(data["value"]), updated_by)

    return jsonify({
        "key": setting.key,
        "value": setting.value,
        "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
        "updated_by": setting.updated_by,
    })


# ============ Testing Endpoints ============

@bp.route("/test/email", methods=["POST"])
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


@bp.route("/canopyorders/upload", methods=["POST"])
def upload_canopy_orders():
    data = request.get_json() or {}
    raw_orders = data.get("orders")
    if not isinstance(raw_orders, list):
        return jsonify({"error": "Missing 'orders' list in request body"}), 400

    normalized_orders = _normalize_canopy_orders(raw_orders)
    if not normalized_orders:
        return jsonify({"error": "No valid orders provided. Use 4-digit order numbers."}), 400

    service = CanopyOrdersUploaderService()
    try:
        upload_result = service.upload_orders(normalized_orders)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        logger.error(f"Canopy Orders upload failed: {error}")
        return jsonify({"error": str(error)}), 500

    if not upload_result.get("success"):
        status_code = upload_result.get("status_code") or 502
        return jsonify({
            "error": upload_result.get("error") or "Canopy Orders upload failed",
            "uploaded_url": upload_result.get("uploaded_url"),
            "filename": upload_result.get("filename"),
        }), status_code

    teams_notified = service.send_teams_notification(
        normalized_orders,
        upload_result["uploaded_url"],
    )

    return jsonify({
        "success": True,
        "filename": upload_result["filename"],
        "uploaded_url": upload_result["uploaded_url"],
        "count": len(normalized_orders),
        "teams_notified": teams_notified,
    })


@bp.route("/status", methods=["GET"])
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


@bp.route("/deploy", methods=["POST"])
def deploy_webhook():
    """
    GitHub webhook endpoint for auto-deployment.

    Receives push events from GitHub, pulls latest code, and reloads the app.
    Verifies GitHub's HMAC signature for security.
    """
    import hmac
    import hashlib
    import subprocess
    import os
    from flask import request

    logger = logging.getLogger(__name__)

    # Log entry (careful not to log secrets)
    logger.info(f"Deploy webhook hit from {request.remote_addr}")

    # Check if deploy webhook is enabled
    if not settings.deploy_webhook_enabled:
        logger.warning("Deploy access denied: Webhook disabled in config")
        return jsonify({"error": "Deploy webhook is disabled"}), 403

    # Verify the secret is configured
    if not settings.deploy_webhook_secret:
        logger.error("Deploy access denied: Secret not configured")
        return jsonify({"error": "Webhook not configured"}), 500

    # Get the signature from GitHub
    signature_header = request.headers.get("X-Hub-Signature-256")
    if not signature_header:
        logger.warning("Deploy access denied: Missing X-Hub-Signature-256 header")
        return jsonify({"error": "Missing signature"}), 403

    # Verify HMAC signature
    payload = request.get_data()
    expected_signature = "sha256=" + hmac.new(
        settings.deploy_webhook_secret.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature_header, expected_signature):
        logger.warning("Deploy access denied: Invalid signature")
        return jsonify({"error": "Invalid signature"}), 403

    # Signature verified - execute deploy script
    logger.info("Signature verified - starting deployment")

    # Determine project root (works on PythonAnywhere)
    project_root = "/home/techhub/techhub-dns"
    deploy_script = os.path.join(project_root, "scripts", "deploy.sh")

    # Check if deploy script exists
    if not os.path.exists(deploy_script):
        logger.error(f"Deploy script not found: {deploy_script}")
        return jsonify({
            "success": False,
            "error": "Deploy script not found"
        }), 500

    try:
        # Run the deploy script
        result = subprocess.run(
            ["bash", deploy_script],
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout
            cwd=project_root
        )

        if result.returncode == 0:
            logger.info(f"Deployment successful: {result.stdout}")
            return jsonify({
                "success": True,
                "message": "Deployment successful",
                "output": result.stdout[-500:] if len(result.stdout) > 500 else result.stdout
            })
        else:
            logger.error(f"Deployment failed: {result.stderr}")
            return jsonify({
                "success": False,
                "error": "Deployment failed",
                "output": result.stderr[-500:] if len(result.stderr) > 500 else result.stderr
            }), 500

    except subprocess.TimeoutExpired:
        logger.error("Deployment timed out")
        return jsonify({
            "success": False,
            "error": "Deployment timed out"
        }), 500
    except Exception as e:
        logger.error(f"Deployment error: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


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


def _normalize_canopy_orders(raw_orders: Any) -> list[str]:
    if not isinstance(raw_orders, list):
        return []

    normalized: list[str] = []
    seen = set()

    for item in raw_orders:
        if not isinstance(item, str):
            continue
        value = item.strip().upper()
        if not value:
            continue
        if value.startswith("TH"):
            value = value[2:]
        if len(value) != 4 or not value.isdigit():
            continue
        formatted = f"TH{value}"
        if formatted in seen:
            continue
        seen.add(formatted)
        normalized.append(formatted)

    return normalized
