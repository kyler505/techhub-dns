# backend/scripts/

Scripts in `backend/scripts/` serve as operational tooling for maintenance, diagnostics, and environment orchestration. Rather than supporting customer-facing APIs, these utilities manipulate persisted state (orders, audit logs, webhook subscriptions) and exercise integrations that are otherwise only used by the running Flask service.

## Responsibility

These entry points are run manually or from deployment/build automation to keep the backend healthy:

- `database_manager.py` is the swiss-army knife for orders/delivery runs: listing, status changes, bulk clears, location fixes, raw SQL, and an interactive menu that walks through the same capability set.
- `manage_inflow_webhook.py` controls Inflow webhook subscriptions by talking to both the remote Inflow API (via `InflowService`) and the local `InflowWebhook` table, enabling list/register/delete/reset workflows.
- `run_audit_retention.py` enforces audit log retention by invoking `apply_system_audit_retention` with configurable cutoffs.
- `diagnose_sharepoint.py` verifies the SharePoint integration surface (site discovery, drive listing, upload) through the `graph_service` API client.
- `test_production_notification.py` kicks off a Teams delivery notification via `teams_recipient_service` to prove outbound alerts are wired correctly.

## Design Patterns

- All scripts insert the repo root into `sys.path` before importing `app.*`, ensuring they bootstrap the same modules the Flask app uses.
- Database-heavy tooling always acquires a `SessionLocal()` session, wraps operations in `try/finally` blocks, and commits/rolls back explicit transactions to keep manual changes atomic.
- `database_manager.py` exposes both argument-based automation (`argparse` flags such as `--list`, `--delete`, `--stats`) and a prompt-driven CLI to balance scripted vs interactive usage.
- `manage_inflow_webhook.py` uses `asyncio`/`InflowService` for outbound HTTP interactions, while keeping local state synced via helper functions like `upsert_local_webhook`.
- Lightweight scripts (audit retention, SharePoint diagnostics, Teams notification) act as thin adapters that configure services via `settings` before invoking shared service helpers.
## Flow

- `database_manager.py` pulls database models across orders, delivery runs, audit logs, notifications, sessions, and system audits, then surfaces CRUD, reporting, and cleanup operations either through the CLI or targeted flags; auxiliary helpers (e.g., `fix_order_locations`) reuse shared building-mapper logic for consistency with production processing.
- `manage_inflow_webhook.py` parses CLI subcommands (`list`, `delete`, `register`, `reset`), resolves URLs/events from args or defaults, and then drives remote API calls followed by local DB updates, ensuring remote state and the `InflowWebhook` table stay aligned.
- `run_audit_retention.py` translates optional CLI arguments into cutoff datetimes before calling `apply_system_audit_retention`, which itself moves rows from hot audit log tables into archives.
- `diagnose_sharepoint.py` authenticates via `graph_service`, looks up the configured SharePoint site and drive, then attempts a sample file upload—logging each step for troubleshooting.
- `test_production_notification.py` simply configures a known recipient and order number, then calls `teams_recipient_service.send_delivery_notification` with `force=True` so deployments can verify outbound Teams alerts are functional.

## Integration

- All scripts import `app.config.settings`, so they share the same environment configuration (database URLs, webhook URLs/events, SharePoint paths, Teams endpoints) as the Flask app.
- Database scripts rely on the SQLAlchemy `SessionLocal` factory plus models defined under `app.models.*`, ensuring schema changes immediately fall through to the tooling without duplication.
- `manage_inflow_webhook.py` and `diagnose_sharepoint.py` touch external HTTP services (`Inflow`, `Microsoft Graph`) through the same service clients the production app uses; secrets/URLs are read from `settings` to keep manual runs consistent with deployments.
- `test_production_notification.py` exercises the Teams notification service, which cascades through internal event handling and external Teams APIs.
- `run_audit_retention.py` calls `apply_system_audit_retention`, tying into the same retention logic invoked by app maintenance jobs; it therefore shares control flow for row movement and logging.
