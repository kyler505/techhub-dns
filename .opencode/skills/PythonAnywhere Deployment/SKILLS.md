---
description: How to debug and deploy to the PythonAnywhere production website (techhub.pythonanywhere.com)
---

# PythonAnywhere Production Workflow

## Connection Detailsr- **Website URL**: https://techhub.pythonanywhere.com
- **SSH Access**: `ssh techhub@ssh.pythonanywhere.com`
- **Project Path**: `/home/techhub/techhub-dns`
- **WSGI File**: `/var/www/techhub_pythonanywhere_com_wsgi.py`
- **Backend virtual environment**:`techhub-dns/backend/.venv`

## Deployment

### Deploy Backend Changes
// turbo
1. Push changes to GitHub main branch
2. SSH and pull: `ssh techhub@ssh.pythonanywhere.com "cd techhub-dns && git pull"`
// turbo
3. Reload webapp: `ssh techhub@ssh.pythonanywhere.com "touch /var/www/techhub_pythonanywhere_com_wsgi.py"`

### Deploy Frontend Changes
The frontend is built via GitHub Actions and uploaded automatically when changes to `frontend/**` are pushed.

To manually trigger a frontend deploy:
1. Go to GitHub Actions → "Deploy frontend to PythonAnywhere"
2. Click "Run workflow" button

Or upload directly from local:
```powershell
scp -r c:\dev\dns\frontend\dist\* techhub@ssh.pythonanywhere.com:/home/techhub/techhub-dns/frontend/dist/
```

## Debugging

### Check Health Endpoints
- Backend health: https://techhub.pythonanywhere.com/health

### View Server Logs
```bash
ssh techhub@ssh.pythonanywhere.com "tail -100 /var/log/techhub.pythonanywhere.com.error.log"
```

### Check If Files Are In Sync
```bash
# Check frontend assets on server
ssh techhub@ssh.pythonanywhere.com "ls -la /home/techhub/techhub-dns/frontend/dist/assets/"

# Check what index.html references
ssh techhub@ssh.pythonanywhere.com "cat /home/techhub/techhub-dns/frontend/dist/index.html"

# Compare local vs server file hashes
ssh techhub@ssh.pythonanywhere.com "md5sum /home/techhub/techhub-dns/frontend/dist/assets/*.js"
```

### Force Reset to GitHub Main
If the server is out of sync:
```bash
ssh techhub@ssh.pythonanywhere.com "cd techhub-dns && git fetch origin && git reset --hard origin/main"
```

## Common Issues

### MIME Type Error for JavaScript Modules
**Symptom**: `Failed to load module script: Expected JavaScript but server responded with MIME type "text/html"`

**Cause**: `index.html` references JS files that don't exist on server (deploy mismatch)

**Fix**:
1. Check `/health/frontend` endpoint to confirm mismatch
2. Re-deploy frontend: trigger GitHub Action or upload via SCP
3. Reload webapp

### 502 Bad Gateway
**Cause**: Backend crashed on startup

**Fix**:
1. Check error logs: `tail -100 /var/log/techhub.pythonanywhere.com.error.log`
2. Usually a missing dependency or environment variable
3. Fix and redeploy

### Changes Not Taking Effect
**Cause**: Webapp not reloaded after git pull

**Fix**: `ssh techhub@ssh.pythonanywhere.com "touch /var/www/techhub_pythonanywhere_com_wsgi.py"`
