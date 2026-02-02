# PythonAnywhere Deployment Guide

Complete guide for deploying the TechHub Delivery application to PythonAnywhere with Flask-SocketIO WebSocket support.

---

## Prerequisites

- PythonAnywhere account (**Web Dev tier** or higher for SSH access)
- MySQL database configured on PythonAnywhere
- Git access to the repository
- Node.js available on PythonAnywhere (for building frontend during deploy)
- Azure AD configuration complete (see [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md))

---

## Part 1: Local Preparation

### 1.1 Frontend Build Flow

The frontend is built on PythonAnywhere during deployment, so a local build is not required.
If you want to validate locally, you can still run:

```powershell
cd frontend
npm install
npm run build
```

---

## Part 2: PythonAnywhere Initial Setup

### 2.1 Clone the Repository

Open a **Bash console** on PythonAnywhere:

```bash
cd ~
git clone https://github.com/kyler505/techhub-dns.git techhub-dns
cd techhub-dns/backend
```

### 2.2 Create Virtual Environment

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install gunicorn eventlet
```

### 2.3 Install PythonAnywhere CLI

```bash
pip install --upgrade pythonanywhere
```

Generate API token:
1. Go to **Account** → **API Token**
2. Click **Create a new API token**

---

## Part 3: Configuration

### 3.1 Environment Variables

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

### 3.2 Upload SAML Certificate

The certificate is not in git. Upload manually:

1. In PythonAnywhere **Files** tab, navigate to `~/techhub-dns/backend`
2. Create folder `certs` if it doesn't exist
3. Upload `saml_idp_cert.crt`

---

## Part 4: Database Setup

### 4.1 Create MySQL Database

1. Go to **Databases** tab in PythonAnywhere
2. Create a new MySQL database
3. Note the connection details:
   - **Database name**: `username$dbname`
   - **Username**: `username`
   - **Password**: (set during creation)
   - **Host**: `username.mysql.pythonanywhere-services.com`

### 4.2 Initialize Database

```bash
cd ~/techhub-dns/backend
source .venv/bin/activate

# Create tables
python -c "from app.database import engine, Base; from app.models import *; Base.metadata.create_all(bind=engine)"

# Or use Alembic migrations
alembic upgrade head
```

---

## Part 5: Deploy with ASGI

### 5.1 Create the Website

Run this command (ASGI beta for WebSocket support):

```bash
pa website create \
  --domain username.pythonanywhere.com \
  --command '/home/username/techhub-dns/backend/.venv/bin/gunicorn --worker-class eventlet -w 1 --chdir /home/username/techhub-dns/backend --bind unix:${DOMAIN_SOCKET} app.main:app'
```

Replace `username` with your PythonAnywhere username.

### 5.2 Verify Deployment

Visit `https://username.pythonanywhere.com` - you should see the React frontend.

---

## Part 6: Managing Your Site

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

---

## Part 7: Updating the Application

### Standard Update Process

1. **On your local machine**:
```powershell
git add .
git commit -m "Update application"
git push
```

2. **On PythonAnywhere**:
```bash
cd ~/techhub-dns
bash scripts/deploy.sh
```

The deploy script runs `npm ci` and `npm run build` in `frontend/`, then reloads the app.

### Automated Deployment

Use a GitHub webhook to trigger the deploy script automatically:

1. Configure webhook secret in `.env`:
```env
DEPLOY_WEBHOOK_ENABLED=true
DEPLOY_WEBHOOK_SECRET=your-secret-here
```

2. Set up GitHub webhook (see [DEPLOY_SETUP.md](../DEPLOY_SETUP.md))

---

## Architecture Notes

### How the Frontend is Served

The Flask backend serves the React frontend from `frontend/dist/`:

- **API routes** (`/api/*`): Handled by Flask blueprints
- **Auth routes** (`/auth/*`): SAML authentication
- **Static files**: React build assets
- **All other routes**: Serve React SPA with fallback to `index.html`
- **WebSocket**: Flask-SocketIO via eventlet

### Path Detection

The backend automatically detects the frontend dist path:
1. `/home/username/techhub-dns/frontend/dist` (PythonAnywhere)
2. Relative path from backend (local development)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Frontend not built" | Build locally and push `frontend/dist/` |
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

---

## ASGI Beta Limitations

> [!WARNING]
> ASGI deployment is **experimental**. Current limitations:
> - No static file mappings in the web UI
> - Limited web UI (request access via "Send feedback")
> - The site won't appear in the normal "Web" tab
> - Pricing may change in the future

---

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
