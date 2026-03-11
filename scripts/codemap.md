# scripts/

## Responsibility

This directory hosts the deployment automation for the TechHub DNS app. The primary artifact is `deploy.sh`, which PythonAnywhere runs whenever GitHub Actions (or an operator) pushes new code. Its job is to keep the remote repo in sync with `origin/main` or `origin/dev`, run backend migrations/tests, build the frontend, and trigger a webapp reload while gating concurrency and surfacing actionable logs.

## Design

- **Guardrails**: The script establishes a `.deploy.running` sentinel to prevent overlapping runs, repopulates `PATH` to expose `npm` in non-login shells, and exits on any error (`set -e`) unless a controlled fallback path exists.
- **Idempotent reload paths**: Reload helpers prefer touching the WSGI file referenced by `WSGI_FILE`, fall back to domain-derived WSGI files, and can optionally call the PythonAnywhere `pa` CLI with `WEBAPP_DOMAIN`. Strictness is configurable via `RELOAD_STRICT`, allowing graceful warnings when reload helpers fail.
- **Dependency choreography**: Frontend installs only when `node_modules` exists but the `package-lock.json` fingerprint changed; otherwise it skips work. Install helpers call `npm ci` then drain fallback `npm install` and incorporate retry/cleanup loops to recover from transient failures.
- **Logging and preflight**: Every major step writes to `deploy.log`; a non-blocking preflight inspects git state, the frontend build artifact, and key backend config variables to aid debugging without blocking the deploy.

## Flow

1. Acquire deploy lock (`.deploy.running`), source shell profiles to expose `npm` if necessary, and ensure `npm` is on the path.
2. `cd` into `PROJECT_ROOT`, fetch/pull the configured `BRANCH`, detect if the `frontend` directory changed since the previous commit, and reset to `origin/BRANCH`.
3. Run backend migrations via `alembic upgrade head` using the available binary (`backend/venv/bin/alembic`, global `alembic`, or `python -m alembic`).
4. If frontend exists and either the code changed or no `dist` folder exists, optionally install deps (`npm ci`/`npm install` with retries) and build (`npm run build`).
5. Log the three most recent commits, then trigger a reload: prefer `pa website reload`, otherwise fall back to touching WSGI files matching `WSGI_FILE` or the supplied `WEBAPP_DOMAIN`. `RELOAD_STRICT` controls whether reload failures abort the deploy.
6. After completion, run a non-blocking preflight that logs git metadata, frontend artifacts, and selected `backend/.env` keys, then remove the lock file.

## Integration

- **GitHub Actions** (`.github/workflows/deploy-pythonanywhere.yml`): On `main`/`dev` pushes, actions run compile/build gates locally, load the PythonAnywhere SSH key, register the PA host, and SSH into the PA account to run `deploy.sh` with `PROJECT_ROOT`, `WEBAPP_DOMAIN`, and `BRANCH` set per environment. If the workflow fails, it tails `deploy.log` remotely and uploads it as an artifact.
- **PythonAnywhere runtime**: The script assumes it lives under `/home/techhub/techhub-dns/scripts/deploy.sh` (or the dev variant) and touches `/var/www/..._wsgi.py` files to force reloads. It also records progress in `deploy.log` inside the project root so GitHub Actions can fetch the same log if needed.
- **Manual runs**: Operators can invoke the script directly (`bash deploy.sh`) or run it via SSH; environment variables override defaults to adapt to staging/production targets.
