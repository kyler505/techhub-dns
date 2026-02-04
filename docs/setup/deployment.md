# Deployment Setup

Complete guide for deploying the TechHub Delivery application to PythonAnywhere with Flask-SocketIO WebSocket support and GitHub webhook automation.

## Prerequisites

- PythonAnywhere account (Web Dev tier or higher for SSH access)
- MySQL database configured on PythonAnywhere
- Git access to the repository
- Node.js available on PythonAnywhere (for building frontend during deploy)
- Azure AD configuration complete (see [authentication setup](authentication.md))

## Local Preparation

### Frontend Build Flow

The frontend is built on PythonAnywhere during deployment, so a local build is not required.
If you want to validate locally, you can still run:

```powershell
cd frontend
npm install
npm run build
```

## PythonAnywhere Initial Setup

### Clone the Repository

Open a Bash console on PythonAnywhere:

```bash
cd ~
git clone https://github.com/kyler505/techhub-dns.git techhub-dns
cd techhub-dns/backend
```

### Create Virtual Environment

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install gunicorn eventlet
```

### Install PythonAnywhere CLI

```bash
pip install --upgrade pythonanywhere
```

Generate API token:
1. Go to Account -> API Token
2. Click Create a new API token

## Configuration

### Environment Variables

```bash
cp .env.example .env
nano .env
```

Update these values:

```env
# Database
DATABASE_URL=mysql+pymysql://username:password@username.mysql.pythonanywhere-services.com/username$database

# Inflow
INFLOW_API_KEY=your_inflow_api_key
INFLOW_COMPANY_ID=your_company_id

# Authentication
SAML_ENABLED=true
SAML_IDP_ENTITY_ID=<from Azure>
SAML_IDP_SSO_URL=<from Azure>
AZURE_TENANT_ID=<from Azure>
AZURE_CLIENT_ID=<from Azure>
AZURE_CLIENT_SECRET=<from Azure>

# App Settings
FLASK_ENV=production
FRONTEND_URL=https://username.pythonanywhere.com
```

### Upload SAML Certificate

The certificate is not in git. Upload manually:

1. In PythonAnywhere Files tab, navigate to `~/techhub-dns/backend`
2. Create folder `certs` if it does not exist
3. Upload `saml_idp_cert.crt`

## Database Setup

### Create MySQL Database

1. Go to Databases tab in PythonAnywhere
2. Create a new MySQL database
3. Note the connection details:
   - Database name: `username$dbname`
   - Username: `username`
   - Password: (set during creation)
   - Host: `username.mysql.pythonanywhere-services.com`

### Initialize Database

```bash
cd ~/techhub-dns/backend
source .venv/bin/activate

# Create tables
python -c "from app.database import engine, Base; from app.models import *; Base.metadata.create_all(bind=engine)"

# Or use Alembic migrations
alembic upgrade head
```

## Deploy with ASGI

### Create the Website

Run this command (ASGI beta for WebSocket support):

```bash
pa website create \
  --domain username.pythonanywhere.com \
  --command '/home/username/techhub-dns/backend/.venv/bin/gunicorn --worker-class eventlet -w 1 --chdir /home/username/techhub-dns/backend --bind unix:${DOMAIN_SOCKET} app.main:app'
```

Replace `username` with your PythonAnywhere username.

### Verify Deployment

Visit `https://username.pythonanywhere.com` - you should see the React frontend.

## Managing Your Site

### Common Commands

| Command | Description |
|---------|-------------|
| `pa website get` | List all ASGI websites |
| `pa website get --domain username.pythonanywhere.com` | Get site details |
| `pa website reload --domain username.pythonanywhere.com` | Reload after code changes |
| `pa website delete --domain username.pythonanywhere.com` | Delete the website |

### View Logs

```bash
# Access log
cat /var/log/username.pythonanywhere.com.access.log

# Error log
cat /var/log/username.pythonanywhere.com.error.log

# Server log
cat /var/log/username.pythonanywhere.com.server.log
```

## Updating the Application

### Standard Update Process

1. On your local machine:
```powershell
git add .
git commit -m "Update application"
git push
```

2. On PythonAnywhere:
```bash
cd ~/techhub-dns
bash scripts/deploy.sh
```

The deploy script runs `npm ci` and `npm run build` in `frontend/`, then reloads the app.

## Automated Deployment (GitHub Webhook)

### Overview

```
Push to GitHub -> GitHub Webhook -> /api/system/deploy -> git pull + frontend build + reload
```

1. You push code to GitHub
2. GitHub sends a webhook to the deploy endpoint
3. The server verifies the request signature
4. The endpoint returns `202 Accepted` quickly and the deploy runs asynchronously in the background
5. The deploy script pulls code, builds the frontend, and reloads the app

### Setup Steps

#### 1. Generate a Webhook Secret

Create a secure random secret:

```bash
# On Linux/Mac:
openssl rand -hex 32

# Or use Python:
python -c "import secrets; print(secrets.token_hex(32))"
```

#### 2. Configure PythonAnywhere

Add to your `.env` file on PythonAnywhere:

```env
DEPLOY_WEBHOOK_ENABLED=true
DEPLOY_WEBHOOK_SECRET=your-generated-secret-here
```

Then reload the web app:

```bash
pa website reload --domain username.pythonanywhere.com
```

#### 3. Configure GitHub Webhook

1. Go to your GitHub repository -> Settings -> Webhooks
2. Click Add webhook
3. Configure:

| Field | Value |
|-------|-------|
| Payload URL | `https://username.pythonanywhere.com/api/system/deploy` |
| Content type | `application/json` |
| Secret | (same secret from step 1) |
| Which events? | Just the push event |
| Active | Yes |

4. Click Add webhook

#### 4. Test the Webhook

1. Make a small commit and push to GitHub
2. Check GitHub -> Settings -> Webhooks -> Recent Deliveries
3. You should see a green checkmark with a `202` response
4. Tail the deploy log to confirm progress:

```bash
cd ~/techhub-dns
tail -n 200 deploy.log
```

### Deployment Process

When triggered, the deploy script (`scripts/deploy.sh`) performs:

1. `git fetch origin main`
2. `git reset --hard origin/main`
3. `npm ci` + `npm run build` in `frontend/`
4. Logs recent commits
5. Touches WSGI file to trigger reload

### Troubleshooting

| Issue | Solution |
|-------|----------|
| 403 - "Deploy webhook is disabled" | Set `DEPLOY_WEBHOOK_ENABLED=true` in `.env` |
| 403 - "Missing signature" | Ensure GitHub webhook has secret configured |
| 403 - "Invalid signature" | Verify secrets match in GitHub and `.env` |
| 500 - "Deploy script not found" | Ensure `scripts/deploy.sh` exists on server |
| GitHub delivery shows "timed out" | The web app did not respond in time. Check `/var/log/username.pythonanywhere.com.server.log` for errors and verify `/api/system/deploy` is reachable. Deploy output is in `~/techhub-dns/deploy.log`. |
| Webhook shows "pending" | The deploy runs asynchronously; check `~/techhub-dns/deploy.log` and server logs for errors |

### Manual Deploy

If needed, you can still deploy manually via SSH:

```bash
cd ~/techhub-dns
bash scripts/deploy.sh
```

### Security Notes

- The webhook endpoint verifies the GitHub signature
- Only authenticated requests trigger deployment
- Never commit the webhook secret to git
- Monitor webhook deliveries for suspicious activity

## Architecture Notes

### How the Frontend is Served

The Flask backend serves the React frontend from `frontend/dist/`:

- API routes (`/api/*`): Handled by Flask blueprints
- Auth routes (`/auth/*`): SAML authentication
- Static files: React build assets
- All other routes: Serve React SPA with fallback to `index.html`
- WebSocket: Flask-SocketIO via eventlet

### Path Detection

The backend automatically detects the frontend dist path:
1. `/home/username/techhub-dns/frontend/dist` (PythonAnywhere)
2. Relative path from backend (local development)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Frontend not built" | Run `bash scripts/deploy.sh` to rebuild frontend |
| 404 for a few seconds | Normal on ASGI beta - just refresh |
| ModuleNotFoundError | Check virtualenv path is correct |
| WebSocket not connecting | Verify `cors_allowed_origins="*"` in SocketIO config |
| Database errors | Verify DATABASE_URL in .env |
| SAML login fails | Check certificate path and IdP URLs |
| Git push fails | Run `git config http.postBuffer 524288000` |

### Checking if Site is Running

```bash
pa website get --domain username.pythonanywhere.com
```

Look for `enabled: True` in the output.

## ASGI Beta Limitations

> [!WARNING]
> ASGI deployment is experimental. Current limitations:
> - No static file mappings in the web UI
> - Limited web UI (request access via "Send feedback")
> - The site will not appear in the normal "Web" tab
> - Pricing may change in the future

## Environment Variables Reference

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `FLASK_ENV` | Set to `production` |
| `INFLOW_API_KEY` | Inflow API key |
| `INFLOW_COMPANY_ID` | Inflow company ID |

### Authentication

| Variable | Description |
|----------|-------------|
| `SAML_ENABLED` | Enable SAML authentication |
| `SAML_IDP_ENTITY_ID` | IdP entity ID |
| `SAML_IDP_SSO_URL` | IdP login URL |
| `AZURE_TENANT_ID` | Azure tenant ID |
| `AZURE_CLIENT_ID` | Service principal client ID |
| `AZURE_CLIENT_SECRET` | Service principal secret |

### Optional Features

| Variable | Description |
|----------|-------------|
| `SHAREPOINT_ENABLED` | Enable SharePoint integration |
| `SMTP_ENABLED` | Enable email notifications |
| `TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED` | Enable Teams notifications |
| `DEPLOY_WEBHOOK_ENABLED` | Enable GitHub auto-deploy |
