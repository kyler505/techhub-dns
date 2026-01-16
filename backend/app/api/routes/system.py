"""
System status API routes.

Provides endpoints for checking backend feature statuses.
"""

from flask import Blueprint, jsonify

from app.config import settings
from app.services.saml_auth_service import saml_auth_service
from app.services.graph_service import graph_service
from app.services.inflow_service import InflowService
import logging

bp = Blueprint("system", __name__, url_prefix="/api/system")


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
