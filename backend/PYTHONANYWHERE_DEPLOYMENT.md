# PythonAnywhere Deployment Guide

This guide covers deploying the TechHub Delivery application to PythonAnywhere.

## Prerequisites

- PythonAnywhere account (Web Dev tier or higher)
- MySQL database configured on PythonAnywhere
- Git access to the repository

## Deployment Steps

### 1. Clone the Repository

Open a Bash console on PythonAnywhere:

```bash
cd ~
git clone <your-repo-url> techhub-dns
cd techhub-dns/backend
```

### 2. Set Up Virtual Environment

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create `.env` file in the `backend` directory:

```bash
cp .env.example .env
nano .env
```

Update the following values:
- `DATABASE_URL=mysql+pymysql://techhub:YOUR_PASSWORD@techhub.mysql.pythonanywhere-services.com/techhub$default`
- Other API keys and secrets as needed

### 4. Configure Web App

1. Go to **Web** tab in PythonAnywhere dashboard
2. Click **Add a new web app**
3. Choose **Manual configuration** → **Python 3.11**
4. Set the following:

| Setting | Value |
|---------|-------|
| Source code | `/home/techhub/techhub-dns/backend` |
| Working directory | `/home/techhub/techhub-dns/backend` |
| Virtualenv | `/home/techhub/techhub-dns/backend/.venv` |
| WSGI configuration file | See step 5 |

### 5. Configure WSGI

Click on the WSGI configuration file link and replace contents with:

```python
import sys
import os

project_path = '/home/techhub/techhub-dns/backend'
if project_path not in sys.path:
    sys.path.insert(0, project_path)

os.environ['FLASK_ENV'] = 'production'

from dotenv import load_dotenv
env_path = os.path.join(project_path, '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)

from app.main import app as application
```

### 6. Static Files (Optional)

For serving static files efficiently, add a static file mapping:

| URL | Directory |
|-----|-----------|
| `/static` | `/home/techhub/techhub-dns/backend/static` |

### 7. Initialize Database

Run database migrations from a Bash console:

```bash
cd ~/techhub-dns/backend
source .venv/bin/activate
python -c "from app.database import init_db; init_db()"
```

### 8. Reload and Test

Click **Reload** button on the Web tab, then visit your site at:
`https://techhub.pythonanywhere.com`

## WebSocket Support (Experimental)

PythonAnywhere offers **experimental** WebSocket support via ASGI. The standard WSGI deployment does **not** support WebSockets, so Flask-SocketIO real-time features will not work.

**Options:**
1. **Use polling fallback**: Flask-SocketIO will automatically fall back to long-polling
2. **Contact PythonAnywhere support**: Request access to the experimental ASGI deployment beta

## Frontend Deployment

The React frontend should be built and deployed separately (e.g., to Vercel, Netlify, or as static files):

```bash
cd ~/techhub-dns/frontend
npm install
npm run build
```

The built files in `dist/` can be:
- Hosted on a static hosting service
- Served from PythonAnywhere as static files

Update `VITE_API_URL` in `.env` to point to your PythonAnywhere backend URL.

## Troubleshooting

### View Error Logs
Go to **Web** tab → **Log files** section → Click on **Error log**

### Common Issues

| Issue | Solution |
|-------|----------|
| ModuleNotFoundError | Ensure virtualenv path is correct |
| Database connection refused | Check MySQL credentials and hostname |
| 500 Internal Server Error | Check the error log for details |

## Maintenance

### Updating the Application

```bash
cd ~/techhub-dns
git pull origin main
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

Then click **Reload** on the Web tab.
