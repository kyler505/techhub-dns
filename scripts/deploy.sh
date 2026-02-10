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

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

: "${BRANCH:=main}"
: "${WSGI_FILE:=/var/www/techhub_pythonanywhere_com_wsgi.py}"

LOG_FILE="${PROJECT_ROOT}/deploy.log"
RUNNING_FILE="${PROJECT_ROOT}/.deploy.running"
LOCKFILE="${PROJECT_ROOT}/frontend/package-lock.json"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

run_logged() {
    local status
    log "+ $*"

    set +e
    "$@" 2>&1 | tee -a "$LOG_FILE"
    status=${PIPESTATUS[0]}
    set -e

    return "$status"
}

run_migrations() {
    if [ ! -d "${PROJECT_ROOT}/backend" ]; then
        log "ERROR: Backend directory not found at ${PROJECT_ROOT}/backend"
        return 1
    fi

    local venv_activate=""
    if [ -f "${PROJECT_ROOT}/backend/.venv/bin/activate" ]; then
        venv_activate="${PROJECT_ROOT}/backend/.venv/bin/activate"
    elif [ -f "${PROJECT_ROOT}/.venv/bin/activate" ]; then
        venv_activate="${PROJECT_ROOT}/.venv/bin/activate"
    fi

    if [ -n "$venv_activate" ]; then
        log "Activating venv: ${venv_activate}"
        # shellcheck disable=SC1090
        source "$venv_activate"
    else
        log "WARNING: No venv found; using current python on PATH"
    fi

    cd "${PROJECT_ROOT}/backend"

    log "Alembic current (pre-upgrade):"
    run_logged python -m alembic current || true

    if ! run_logged python -m alembic upgrade head; then
        log "ERROR: Alembic upgrade failed"
        log "Alembic current (post-failure):"
        run_logged python -m alembic current || true
        log "Alembic heads:"
        run_logged python -m alembic heads || true
        return 1
    fi

    log "Alembic upgrade complete"
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

log "Running database migrations..."
run_migrations
log "Database migrations complete"

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
