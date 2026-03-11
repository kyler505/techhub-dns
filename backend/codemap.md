# backend/

This directory hosts the Flask-based API, auxiliary runners, and database migration tooling that power the delivery workflow backend and expose the React frontend for production deployments.

## Responsibility

- `app/` wires together Flask (routes, middleware, Socket.IO) with SQLAlchemy, configuration, and service layers so every `/api` request is authenticated, validated, and recorded in the MySQL backend before either returning JSON or serving the SPA static assets when the path matches nothing else.
- `alembic/` keeps schema history (models, versions, env config) so migrations can be generated/run from the same SQLAlchemy models that the app and scheduler share. Migration scripts also capture domain events like print jobs, vehicle checkouts, and system settings.
- `scripts/` surfaces operational helpers (`run_audit_retention`, `diagnose_sharepoint`, webhook management, etc.) for ad-hoc maintenance or integrations that are not part of the HTTP API.
- `requirements.txt` pins the Flask/SQLAlchemy/azures/auth/scheduling stack that every runtime entry point relies on (WSGI server, scheduler runner, scheduler jobs, and CLI helpers).
- `run_scheduler.py` is the process entry that boots APScheduler, optionally auto-registers the Inflow webhook, and keeps polling sync jobs alive in production when `SCHEDULER_ENABLED` is set.
- `wsgi.py` is the PythonAnywhere entry that primes the environment, loads `.env`, and exposes `app.main.app` to the host.
- `check_setting_server.py` is a small UTF-16 helper script that reads `SystemSetting` rows (like `teams_recipient_notifications_enabled`) to confirm configuration state from the database.

## Design

- Configuration is centralized in `app/config.py` via `pydantic-settings`, so every entry point (Flask app, scheduler, scripts) consumes the same `.env`-backed `Settings` object for DB URL, webhook flags, SharePoint/Teams credentials, and feature gates.
- The Flask app composes request handling from blueprints (orders, inflow, audit, sharepoint, auth, system, analytics, observability, vehicle checkouts) plus middleware for error shaping, auth, and Socket.IO events; each blueprint delegates to service objects under `app/services` that encapsulate business rules or integrations (PDF generation, SharePoint uploads, Inflow syncs, etc.).
- Background jobs run via APScheduler in `app/scheduler.py`: backup polling syncs, webhook health checks, and auto-registration logic share the same session factory and services; `run_scheduler.py` is a lightweight runner that watches for SIGTERM/SIGINT, logs runtime pool sizing, and shuts down cleanly.
- SQLAlchemy sessions and connection pooling are configured in `app/database.py` with conservative defaults, runtime overrides from environment variables (`DB_POOL_SIZE`, etc.), and helpers `get_db_session`/`get_db` used by routes, services, and scheduler jobs.

## Flow

- Incoming requests hit Flask/Socket.IO, pass through auth and error-handling middleware, and are dispatched to blueprint endpoints (e.g., `/api/orders`, `/api/inflow`). Each endpoint gets a DB session from `app/database`, invokes service logic, and either commits or rolls back before returning JSON; `/health` exercises a lightweight `SELECT 1` to report pool stats.
- Static file serving is chained after API routing: production deployments load `frontend/dist` (searched in repo root and PythonAnywhere paths) and fall back to indices; missing builds trigger JSON hints so observability tools know to run `npm run build`.
- The scheduler runner evaluates `INFLOW_POLLING_SYNC_ENABLED`/`INFLOW_WEBHOOK_ENABLED`, optionally auto-registers the webhook via the async Inflow client, and uses APScheduler jobs to call `sync_inflow_orders` with the same Flask-backed services; shutdown is handled via signal handlers.

## Integration

- This backend sits behind the React SPA built from `frontend/dist` and uses Flask to serve that bundle when available; it relies on the frontend only for assets, keeping API responsibilities here.
- Database integrations run through SQLAlchemy models, Alembic migrations, and the `SystemSetting`/`InflowWebhook` tables referenced by scheduler jobs and helper scripts like `check_setting_server.py`.
- External integrations (Inflow API, SharePoint, Teams Graph, SMTP, SAML) are wired through service classes and configuration flags so scripts can run them with the same credentials as the web app.
- Operational entry points (`wsgi.py`, `run_scheduler.py`, scripts in `scripts/`) all consume `requirements.txt` to ensure Flask, APScheduler, eventlet, SQLAlchemy, and Azure/SharePoint dependencies are loaded consistently.
