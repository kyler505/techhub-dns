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
WEBAPP_DOMAIN="${WEBAPP_DOMAIN:-}"
BRANCH="${BRANCH:-main}"
LOG_FILE="${LOG_FILE:-${PROJECT_ROOT}/deploy.log}"
RUNNING_FILE="${RUNNING_FILE:-${PROJECT_ROOT}/.deploy.running}"
LOCKFILE="${LOCKFILE:-${PROJECT_ROOT}/frontend/package-lock.json}"
DEPLOY_PREFLIGHT="${DEPLOY_PREFLIGHT:-1}"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

reload_with_wsgi_touch() {
    if [ -f "$WSGI_FILE" ]; then
        touch "$WSGI_FILE"
        log "Touched WSGI file - app will reload"
    else
        log "WARNING: WSGI file not found at $WSGI_FILE"
    fi
}

run_non_blocking_preflight() {
    if [ "$DEPLOY_PREFLIGHT" = "0" ]; then
        log "Post-deploy preflight skipped (DEPLOY_PREFLIGHT=0)"
        return 0
    fi

    set +e
    log "Post-deploy preflight (non-blocking)"

    local current_branch current_commit frontend_dist env_file
    current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
    current_commit="$(git rev-parse --short HEAD 2>/dev/null)"
    log "- git_branch=${current_branch:-unknown} git_commit=${current_commit:-unknown}"
    log "- expected_project_root=$PROJECT_ROOT"

    frontend_dist="$PROJECT_ROOT/frontend/dist"
    if [ -d "$frontend_dist" ]; then
        log "- frontend_dist_exists=yes path=$frontend_dist"
    else
        log "- frontend_dist_exists=no path=$frontend_dist"
    fi

    env_file="$PROJECT_ROOT/backend/.env"
    if [ -f "$env_file" ]; then
        local key
        for key in DB_POOL_SIZE DB_MAX_OVERFLOW DB_POOL_TIMEOUT DB_POOL_RECYCLE SCHEDULER_ENABLED; do
            if grep -q "^${key}=" "$env_file"; then
                log "- env_key_present ${key}=yes"
            else
                log "- env_key_present ${key}=no"
            fi
        done
    else
        log "- backend_env_file_present=no path=$env_file"
    fi

    set -e
}

remove_node_modules_with_retries() {
    local max_attempts=5
    local attempt=1

    while [ "$attempt" -le "$max_attempts" ]; do
        rm -rf node_modules 2>/dev/null || true

        if [ ! -d node_modules ]; then
            return 0
        fi

        log "WARNING: node_modules cleanup attempt ${attempt}/${max_attempts} did not fully remove directory"
        sleep 2
        attempt=$((attempt + 1))
    done

    log "ERROR: Unable to remove node_modules after ${max_attempts} attempts"
    return 1
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

    log "WARNING: Frontend dependency install failed; cleaning node_modules and retrying once"
    remove_node_modules_with_retries
    log "Retrying frontend dependency install..."
    set +e
    "${install_cmd[@]}"
    local second_attempt_status=$?
    set -e

    if [ "$second_attempt_status" -ne 0 ]; then
        log "ERROR: Frontend dependency install failed after cleanup retry"
        return 1
    fi
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

# Reload web app (prefer PythonAnywhere CLI when available)
if [ -n "$WEBAPP_DOMAIN" ] && command -v pa >/dev/null 2>&1; then
    if pa website reload --domain "$WEBAPP_DOMAIN"; then
        log "Reloaded app via PythonAnywhere CLI for domain: $WEBAPP_DOMAIN"
    else
        log "WARNING: PythonAnywhere CLI reload failed for domain: $WEBAPP_DOMAIN; falling back to WSGI touch"
        reload_with_wsgi_touch
    fi
else
    if [ -z "$WEBAPP_DOMAIN" ]; then
        log "WEBAPP_DOMAIN not set; using WSGI touch fallback"
    else
        log "PythonAnywhere CLI (pa) not found; using WSGI touch fallback"
    fi
    reload_with_wsgi_touch
fi

log "=========================================="
log "Deployment complete!"
log "=========================================="

run_non_blocking_preflight
