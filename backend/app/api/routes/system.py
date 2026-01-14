"""
System status API routes.

Provides endpoints for checking backend feature statuses.
"""

from flask import Blueprint, jsonify

from app.config import settings
from app.services.saml_auth_service import saml_auth_service
from app.services.graph_service import graph_service

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
        "inflow_webhook": _get_inflow_webhook_status(),
    }

    return jsonify(status)


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
    """Get Microsoft Graph API status."""
    configured = graph_service.is_configured()

    if not configured:
        return {
            "name": "Microsoft Graph",
            "enabled": False,
            "configured": False,
            "status": "disabled",
            "details": "Service Principal not configured",
        }

    return {
        "name": "Microsoft Graph",
        "enabled": True,
        "configured": True,
        "status": "active",
        "details": "Email, SharePoint, Teams via Graph API",
    }


def _get_sharepoint_status():
    """Get SharePoint storage status."""
    # SharePoint now uses Graph API via Service Principal
    graph_configured = graph_service.is_configured()
    site_configured = bool(settings.sharepoint_site_url)

    if not graph_configured:
        return {
            "name": "SharePoint Storage",
            "enabled": False,
            "configured": False,
            "status": "disabled",
            "details": "Requires Graph API configuration",
        }

    if not site_configured:
        return {
            "name": "SharePoint Storage",
            "enabled": True,
            "configured": False,
            "status": "warning",
            "details": "Graph API ready, site URL not set",
        }

    return {
        "name": "SharePoint Storage",
        "enabled": True,
        "configured": True,
        "status": "active",
        "details": settings.sharepoint_site_url,
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


def _get_inflow_webhook_status():
    """Get Inflow webhook status."""
    enabled = settings.inflow_webhook_enabled
    url = settings.inflow_webhook_url

    if not enabled:
        return {
            "name": "Inflow Webhooks",
            "enabled": False,
            "configured": False,
            "status": "disabled",
            "details": "Webhook integration disabled",
        }

    if not url:
        return {
            "name": "Inflow Webhooks",
            "enabled": True,
            "configured": False,
            "status": "warning",
            "details": "Enabled but webhook URL not configured",
        }

    return {
        "name": "Inflow Webhooks",
        "enabled": True,
        "configured": True,
        "status": "active",
        "details": url,
    }
