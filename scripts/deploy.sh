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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WSGI_FILE="/var/www/techhub_pythonanywhere_com_wsgi.py"
LOG_FILE="${PROJECT_ROOT}/deploy.log"
BRANCH="main"
RUNNING_FILE="${PROJECT_ROOT}/.deploy.running"
LOCKFILE="${PROJECT_ROOT}/frontend/package-lock.json"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
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

# Run DB migrations (prevents schema drift causing 500s)
BACKEND_DIR="$PROJECT_ROOT/backend"
if [ -d "$BACKEND_DIR" ]; then
    log "Running DB migrations (alembic upgrade head)..."

    if [ -f "$BACKEND_DIR/.venv/bin/activate" ]; then
        # shellcheck disable=SC1091
        . "$BACKEND_DIR/.venv/bin/activate"
        log "Activated backend virtualenv: $BACKEND_DIR/.venv"
    elif [ -f "$PROJECT_ROOT/.venv/bin/activate" ]; then
        # shellcheck disable=SC1091
        . "$PROJECT_ROOT/.venv/bin/activate"
        log "Activated project virtualenv: $PROJECT_ROOT/.venv"
    else
        log "WARNING: No virtualenv found; running migrations with system python"
    fi

    cd "$BACKEND_DIR"
    python -m alembic upgrade head
    cd "$PROJECT_ROOT"

    log "DB migrations complete"
else
    log "WARNING: Backend directory not found at $BACKEND_DIR; skipping migrations"
fi

# Build frontend on PythonAnywhere
if [ -d "$PROJECT_ROOT/frontend" ]; then
    log "Building frontend..."
    cd "$PROJECT_ROOT/frontend"

    # Reliability > speed: always reinstall deps before building.
    if [ -f "$LOCKFILE" ]; then
        log "Installing frontend dependencies (npm ci)..."
        npm ci --include=dev
    else
        log "WARNING: package-lock.json not found; running npm install"
        npm install --include=dev
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
