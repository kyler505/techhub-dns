#!/bin/bash
# =============================================================================
# TechHub Delivery - Auto-Deploy Script
# =============================================================================
# This script is called by GitHub Actions (SSH) or manually to pull latest code
# and reload.
# Location: /home/techhub/techhub-dns/scripts/deploy.sh
#
# Usage: bash deploy.sh
# =============================================================================

set -e  # Exit on error

# Configuration
PROJECT_ROOT="${PROJECT_ROOT:-/home/techhub/techhub-dns}"
WSGI_FILE="${WSGI_FILE:-/var/www/techhub_pythonanywhere_com_wsgi.py}"
BRANCH="${BRANCH:-main}"
LOG_FILE="${LOG_FILE:-${PROJECT_ROOT}/deploy.log}"
RUNNING_FILE="${RUNNING_FILE:-${PROJECT_ROOT}/.deploy.running}"
LOCKFILE="${LOCKFILE:-${PROJECT_ROOT}/frontend/package-lock.json}"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

install_frontend_deps() {
    local -a install_cmd

    if [ -f "$LOCKFILE" ]; then
        log "Installing frontend dependencies (npm ci)..."
        install_cmd=(npm ci --include=dev)
    else
        log "WARNING: package-lock.json not found; running npm install"
        install_cmd=(npm install --include=dev)
    fi

    set +e
    "${install_cmd[@]}"
    local first_attempt_status=$?
    set -e

    if [ "$first_attempt_status" -eq 0 ]; then
        return 0
    fi

    log "WARNING: Frontend dependency install failed; removing node_modules and retrying once"
    rm -rf node_modules
    log "Retrying frontend dependency install..."
    "${install_cmd[@]}"
}

# Deploy lock (prevents concurrent deploys)
if [ -f "$RUNNING_FILE" ]; then
    existing_pid="$(cat "$RUNNING_FILE" 2>/dev/null || true)"

    if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" >/dev/null 2>&1; then
        log "ERROR: Deploy already running (pid=$existing_pid); exiting"
        exit 1
    fi

    # Stale/invalid marker
    rm -f "$RUNNING_FILE"
fi

# Create marker atomically (avoid race between two webhook deliveries)
if ! ( set -o noclobber; echo "$$" > "$RUNNING_FILE" ) 2>/dev/null; then
    existing_pid="$(cat "$RUNNING_FILE" 2>/dev/null || true)"
    log "ERROR: Deploy already running (pid=${existing_pid:-unknown}); exiting"
    exit 1
fi

trap 'rm -f "$RUNNING_FILE"' EXIT

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

    # Reliability > speed: always reinstall deps before building.
    install_frontend_deps
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
