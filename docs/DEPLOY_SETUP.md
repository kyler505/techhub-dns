# GitHub Auto-Deploy Setup

This guide explains how to set up automatic deployments when you push code to GitHub.

---

## Overview

```
Push to GitHub → GitHub Webhook → /api/system/deploy → git pull + frontend build + reload
```

1. You push code to GitHub
2. GitHub sends a webhook to the deploy endpoint
3. The server verifies the request signature
4. It runs `git pull`, builds the frontend, and reloads the app

---

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

Then reload the web app:

```bash
pa website reload --domain username.pythonanywhere.com
```

### 3. Configure GitHub Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks**
2. Click **Add webhook**
3. Configure:

| Field | Value |
|-------|-------|
| Payload URL | `https://username.pythonanywhere.com/api/system/deploy` |
| Content type | `application/json` |
| Secret | (same secret from step 1) |
| Which events? | Just the push event |
| Active | ✓ Checked |

4. Click **Add webhook**

### 4. Test the Webhook

1. Make a small commit and push to GitHub
2. Check GitHub → Settings → Webhooks → Recent Deliveries
3. You should see a green checkmark with a 200 response

---

## Deployment Process

When triggered, the deploy script (`scripts/deploy.sh`) performs:

1. `git fetch origin main`
2. `git reset --hard origin/main`
3. `npm ci` + `npm run build` in `frontend/`
4. Logs recent commits
5. Touches WSGI file to trigger reload

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 403 - "Deploy webhook is disabled" | Set `DEPLOY_WEBHOOK_ENABLED=true` in `.env` |
| 403 - "Missing signature" | Ensure GitHub webhook has secret configured |
| 403 - "Invalid signature" | Verify secrets match in GitHub and `.env` |
| 500 - "Deploy script not found" | Ensure `scripts/deploy.sh` exists on server |
| Webhook shows "pending" | Check server logs for errors |

---

## Manual Deploy

If needed, you can still deploy manually via SSH:

```bash
cd ~/techhub-dns
bash scripts/deploy.sh
```

---

## Security Notes

- The webhook endpoint verifies the GitHub signature
- Only authenticated requests trigger deployment
- Never commit the webhook secret to git
- Monitor webhook deliveries for suspicious activity
