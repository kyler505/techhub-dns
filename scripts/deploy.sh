#!/bin/bash
# =============================================================================
# TechHub Delivery - Auto-Deploy Script
# =============================================================================
# This script is called by the GitHub webhook to pull latest code and reload.
# Location: /home/techhub/techhub-dns/scripts/deploy.sh
#
# Usage: bash deploy.sh
# =============================================================================

set -e  # Exit on error

# Configuration
PROJECT_ROOT="/home/techhub/techhub-dns"
WSGI_FILE="/var/www/techhub_pythonanywhere_com_wsgi.py"
LOG_FILE="${PROJECT_ROOT}/deploy.log"
BRANCH="main"
LOCKFILE="${PROJECT_ROOT}/frontend/package-lock.json"
LOCKFILE_HASH_FILE="${PROJECT_ROOT}/.deploy-lockfile.sha256"
NODE_MODULES_DIR="${PROJECT_ROOT}/frontend/node_modules"

# Ensure npm is available in non-interactive shells
if ! command -v npm >/dev/null 2>&1; then
    [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
    [ -f "$HOME/.profile" ] && . "$HOME/.profile"
    export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
    log "ERROR: npm not found in PATH; cannot build frontend"
    exit 1
fi

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Start deployment
log "=========================================="
log "Starting deployment..."
log "=========================================="

# Navigate to project directory
cd "$PROJECT_ROOT"
log "Changed to $PROJECT_ROOT"

# Fetch and pull latest changes
log "Pulling latest changes from origin/$BRANCH..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
log "Git pull complete"

# Build frontend on PythonAnywhere
if [ -d "$PROJECT_ROOT/frontend" ]; then
    log "Building frontend..."
    cd "$PROJECT_ROOT/frontend"
    if [ -f "$LOCKFILE" ]; then
        CURRENT_HASH=$(sha256sum "$LOCKFILE" | awk '{print $1}')
        PREVIOUS_HASH=""
        if [ -f "$LOCKFILE_HASH_FILE" ]; then
            PREVIOUS_HASH=$(cat "$LOCKFILE_HASH_FILE")
        fi

        if [ ! -d "$NODE_MODULES_DIR" ]; then
            log "node_modules missing; installing frontend dependencies..."
            npm ci
            echo "$CURRENT_HASH" > "$LOCKFILE_HASH_FILE"
        elif [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ]; then
            log "package-lock.json changed; reinstalling frontend dependencies..."
            npm ci
            echo "$CURRENT_HASH" > "$LOCKFILE_HASH_FILE"
        else
            log "package-lock.json unchanged; skipping npm ci"
        fi
    else
        log "WARNING: package-lock.json not found; running npm install"
        npm install
    fi
    log "Running frontend build..."
    npm run build
    log "Frontend build complete"
    cd "$PROJECT_ROOT"
else
    log "WARNING: Frontend directory not found at $PROJECT_ROOT/frontend"
fi

# Show what changed
log "Recent commits:"
git log --oneline -3

# Touch WSGI file to trigger reload
if [ -f "$WSGI_FILE" ]; then
    touch "$WSGI_FILE"
    log "Touched WSGI file - app will reload"
else
    log "WARNING: WSGI file not found at $WSGI_FILE"
fi

log "=========================================="
log "Deployment complete!"
log "=========================================="
