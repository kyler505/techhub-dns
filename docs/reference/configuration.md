# Configuration Reference

## Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `INFLOW_API_URL` | Inflow Cloud API base URL |
| `INFLOW_API_KEY` | Inflow API key |
| `INFLOW_COMPANY_ID` | Inflow company ID |
| `SECRET_KEY` | Flask secret key |

## Authentication

| Variable | Description |
|----------|-------------|
| `SAML_ENABLED` | Enable SAML authentication |
| `SAML_IDP_ENTITY_ID` | IdP entity ID |
| `SAML_IDP_SSO_URL` | IdP login URL |
| `SAML_IDP_CERT_PATH` | Path to IdP certificate |
| `SAML_SP_ENTITY_ID` | Service provider entity ID |
| `SAML_ACS_URL` | Assertion consumer service URL |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Service principal client ID |
| `AZURE_CLIENT_SECRET` | Service principal secret |

## Features

| Variable | Description |
|----------|-------------|
| `SHAREPOINT_ENABLED` | Enable SharePoint storage |
| `SHAREPOINT_SITE_URL` | SharePoint site URL |
| `SHAREPOINT_FOLDER_PATH` | Base folder path |
| `SMTP_ENABLED` | Enable email sending |
| `SMTP_FROM_ADDRESS` | Sender email address |
| `TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED` | Enable Teams notifications |
| `TEAMS_NOTIFICATION_QUEUE_FOLDER` | SharePoint queue folder |

## Sync Configuration

| Variable | Description |
|----------|-------------|
| `INFLOW_POLLING_SYNC_ENABLED` | Enable polling sync |
| `INFLOW_POLLING_SYNC_INTERVAL_MINUTES` | Sync interval |
| `INFLOW_WEBHOOK_ENABLED` | Enable webhook sync |
| `INFLOW_WEBHOOK_URL` | Webhook receiver URL |
| `INFLOW_WEBHOOK_EVENTS` | Events to subscribe |
| `INFLOW_WEBHOOK_AUTO_REGISTER` | Auto-register on startup |

## Deployment

| Variable | Description |
|----------|-------------|
| `FLASK_ENV` | Environment (development/production) |
| `FRONTEND_URL` | Frontend URL for CORS |
| `DEPLOY_WEBHOOK_ENABLED` | Enable GitHub deploy webhook |
| `DEPLOY_WEBHOOK_SECRET` | Webhook signature secret |
