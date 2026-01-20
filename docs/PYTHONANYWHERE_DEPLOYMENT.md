# PythonAnywhere Deployment Guide

Complete guide for deploying the TechHub Delivery application to PythonAnywhere with Flask-SocketIO WebSocket support (ASGI beta).

## Prerequisites

- PythonAnywhere account (**Web Dev tier** or higher)
- MySQL database configured on PythonAnywhere
- Git access to the repository
- Node.js installed locally (for building frontend)

---

## Part 1: Local Preparation (on your development machine)

### 1.1 Build the Frontend

PythonAnywhere doesn't have Node.js, so build the frontend locally:

```powershell
cd frontend
npm install
npm run build
```

### 1.2 Commit the Build to Git

The `frontend/dist/` folder must be in git. Ensure `.gitignore` has this line **commented out**:

```gitignore
# frontend/dist/  # Uncomment to exclude production build from git
```

Then commit:

```powershell
git add frontend/dist -f
git commit -m "Add frontend production build"
git push
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

### 2.3 Generate API Token

1. Go to **Account** → **API Token**
2. Click **Create a new API token**

This is required for the `pa` CLI tool.

### 2.4 Install PythonAnywhere CLI

```bash
pip install --upgrade pythonanywhere
```

### 2.5 Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Update these values (see `docs/AUTHENTICATION_SETUP.md` for Azure details):

```env
# Database
DATABASE_URL=mysql+pymysql://techhub:YOUR_PASSWORD@techhub.mysql.pythonanywhere-services.com/techhub$default

# Inflow
INFLOW_API_KEY=your_inflow_api_key

# Authentication (SAML + Service Principal)
SAML_ENABLED=true
SAML_IDP_ENTITY_ID=...
SAML_IDP_SSO_URL=...
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...

# App Settings
FLASK_ENV=production
FRONTEND_URL=https://techhub.pythonanywhere.com
```

### 2.6 Upload SAML Certificate

The SAML certificate (`saml_idp_cert.crt`) is not in git. You must upload it manually:

1.  In PythonAnywhere **Files** tab, navigate to `~/techhub-dns/backend`.
2.  Create a folder named `certs` if it doesn't exist.
3.  Upload your `saml_idp_cert.crt` file into this folder.
4.  Verify path in `.env` is `SAML_IDP_CERT_PATH=certs/saml_idp_cert.crt`.

---

## Part 3: Initialize Database

```bash
cd ~/techhub-dns/backend
source .venv/bin/activate
python -c "from app.database import engine, Base; from app.models import order, teams_notification, audit_log, delivery_run; Base.metadata.create_all(bind=engine)"
```

---

## Part 4: Deploy with ASGI (Flask-SocketIO + WebSocket)

### 4.1 Create the Website

Run this command (all on one line):

```bash
pa website create --domain techhub.pythonanywhere.com --command '/home/techhub/techhub-dns/backend/.venv/bin/gunicorn --worker-class eventlet -w 1 --chdir /home/techhub/techhub-dns/backend --bind unix:${DOMAIN_SOCKET} app.main:app'
```

If successful, you'll see:

```
< All done! Your site is now live at techhub.pythonanywhere.com. >
```

### 4.2 Verify the Deployment

Visit `https://techhub.pythonanywhere.com` - you should see the React frontend.

---

## Part 5: Managing Your Site

### Common Commands

| Command | Description |
|---------|-------------|
| `pa website get` | List all ASGI websites |
| `pa website get --domain techhub.pythonanywhere.com` | Get site details |
| `pa website reload --domain techhub.pythonanywhere.com` | Reload after code changes |
| `pa website delete --domain techhub.pythonanywhere.com` | Delete the website |

### View Logs

```bash
# Access log
cat /var/log/techhub.pythonanywhere.com.access.log

# Error log
cat /var/log/techhub.pythonanywhere.com.error.log

# Server log
cat /var/log/techhub.pythonanywhere.com.server.log
```

---

## Part 6: Updating the Application

### Standard Update Process

1. **On your local machine** (if frontend changed):
   ```powershell
   cd frontend
   npm run build
   cd ..
   git add .
   git commit -m "Update application"
   git push
   ```

2. **On PythonAnywhere:**
   ```bash
   cd ~/techhub-dns
   git pull
   cd backend
   source .venv/bin/activate
   pip install -r requirements.txt  # Only if dependencies changed
   pa website reload --domain techhub.pythonanywhere.com
   ```

---

## Architecture Notes

### How the Frontend is Served

The Flask backend serves the React frontend from `/home/techhub/techhub-dns/frontend/dist/`:

- **API routes** (`/api/*`) are handled by Flask blueprints
- **All other routes** serve the React SPA with fallback to `index.html`
- **WebSocket** connections use Flask-SocketIO via eventlet

### Path Detection

The backend automatically detects the frontend dist path by checking:
1. `/home/techhub/techhub-dns/frontend/dist` (PythonAnywhere)
2. Relative path from backend (local development)

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Frontend not built" message | The `frontend/dist` folder is missing. Build locally and push to git. |
| 404 for a few seconds on reload | Normal on ASGI beta - just refresh |
| `ModuleNotFoundError` | Check virtualenv path: `/home/techhub/techhub-dns/backend/.venv` |
| WebSocket not connecting | Ensure `cors_allowed_origins="*"` is set in SocketIO config |
| Database errors | Verify `DATABASE_URL` in `.env` is correct |
| `ValidationError: flask_env` | Run `git pull` - config was updated to accept this env var |
| Git push hangs or fails with chunk error | Run `git config http.postBuffer 524288000` to increase buffer size |

### Checking if Site is Running

```bash
pa website get --domain techhub.pythonanywhere.com
```

Look for `enabled: True` in the output.

---

## ASGI Beta Limitations

> [!WARNING]
> ASGI deployment is **experimental**. Current limitations:
> - No static file mappings in the web UI
> - Limited web UI (request access via "Send feedback" on your account page)
> - Pricing may change in the future
> - The site won't appear in the normal "Web" tab

---

## MySQL Database Setup

### Create Database (if not already done)

1. Go to **Databases** tab in PythonAnywhere
2. Create a new MySQL database
3. Note the:
   - **Database name**: `techhub$default`
   - **Username**: `techhub`
   - **Password**: (set during creation)
   - **Host**: `techhub.mysql.pythonanywhere-services.com`

### Connection String Format

```
mysql+pymysql://techhub:PASSWORD@techhub.mysql.pythonanywhere-services.com/techhub$default
```

---

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | MySQL connection string | ✅ |
| `FLASK_ENV` | Set to `production` | ✅ |
| `INFLOW_API_KEY` | InFlow API key | ✅ |
| `SHAREPOINT_ENABLED` | Enable SharePoint integration | No |
| `SMTP_ENABLED` | Enable email notifications | No |
| `TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED` | Enable Teams notifications | No |
