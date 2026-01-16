# GitHub Auto-Deploy Setup

This guide explains how to set up automatic deployments when you push code to GitHub.

## How It Works

1. You push code to GitHub
2. GitHub sends a webhook to `https://techhub.pythonanywhere.com/api/system/deploy`
3. The server verifies the request signature
4. It runs `git pull` and reloads the app

## Setup Steps

### 1. Generate a Webhook Secret

Create a secure random secret:

```bash
# On Linux/Mac:
openssl rand -hex 32

# Or use Python:
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Configure PythonAnywhere

Add to your `.env` file on PythonAnywhere:

```env
DEPLOY_WEBHOOK_ENABLED=true
DEPLOY_WEBHOOK_SECRET=your-generated-secret-here
```

Then reload the web app.

### 3. Configure GitHub Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks**
2. Click **Add webhook**
3. Configure:
   - **Payload URL**: `https://techhub.pythonanywhere.com/api/system/deploy`
   - **Content type**: `application/json`
   - **Secret**: (same secret from step 1)
   - **Events**: Select "Just the push event"
   - **Active**: ✓ Checked
4. Click **Add webhook**

### 4. Test It

1. Make a small commit and push to GitHub
2. Check GitHub → Settings → Webhooks → Recent Deliveries
3. You should see a green checkmark with a 200 response

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 403 Forbidden - "Deploy webhook is disabled" | Set `DEPLOY_WEBHOOK_ENABLED=true` in `.env` |
| 403 Forbidden - "Missing signature" | Check GitHub webhook has secret configured |
| 403 Forbidden - "Invalid signature" | Ensure secrets match in GitHub and `.env` |
| 500 - "Deploy script not found" | Ensure `scripts/deploy.sh` exists on server |

## Manual Deploy

If needed, you can still deploy manually via SSH:

```bash
cd ~/techhub-dns
git pull origin main
touch /var/www/techhub_pythonanywhere_com_wsgi.py
```
