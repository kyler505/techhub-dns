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
    log "Installing frontend dependencies..."
    npm ci
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
