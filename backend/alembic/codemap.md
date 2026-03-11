# backend/alembic/

This directory owns the Alembic migrations for the Flask/SQLAlchemy backend. It keeps a reusable environment bootstrap (`env.py`), the migration template (`script.py.mako`), and the generated revision scripts under `versions/`.

## Responsibility

- Keep track of schema drift via sequential revision scripts beneath `versions/` (e.g., `0001_mysql_initial.py`, `0004_add_system_settings.py`, `add_auth_tables.py`, ...). Each revision file defines an `upgrade()` / `downgrade()` pair that mutates the shared metadata documented in `app.models` and persisted through `app.database.Base`.
- Tie Alembic to the running application by loading the same `settings.database_url` and metadata so `alembic revision --autogenerate` and `alembic upgrade/ downgrade` operate on the real models.

## Design Patterns

- **Bootstrapped `env.py`**: inserts the repo parent on `sys.path`, imports `app.database.Base`, `app.config.settings`, and critical model classes, sets `sqlalchemy.url` from the Flask settings, and exposes `Base.metadata` as `target_metadata` for autogenerate.
- **Template-driven revisions**: `script.py.mako` scaffolds revisions with typed metadata (`Sequence`, `Union`) and stubbed `upgrade`/`downgrade` functions. New revisions inherit the template header (revision IDs, dependencies) and default to `pass` until filled.
- **Single source of truth for SQLAlchemy metadata**: all migrations reference `app.database.Base.metadata`, so changes must flow through that Base or the imported models. That keeps the schema representation aligned with the ORM layer rather than duplicating DDL.

## Flow

1. **Bootstrap**: `alembic.ini` points `script_location` to the `alembic/` tree and `env.py` adds the parent folder to `sys.path`. When Alembic runs, `context.config` parses `alembic.ini`, logging is configured, and `settings.database_url` overrides the placeholder `sqlalchemy.url` so migrations target the runtime database.
2. **Metadata wiring**: `target_metadata = Base.metadata` (along with explicit imports of `Order`, `AuditLog`, etc.) allows Alembic to compare reflected schema against ORM models during autogeneration.
3. **Online vs offline execution**: `env.py` branches on `context.is_offline_mode()`. Offline mode simply configures the context with the URL and emits SQL; online mode builds an engine from `engine_from_config(...)` with `pool.NullPool`, obtains a connection, and runs migrations within a transaction.
4. **Revision lifecycle**: developers run `alembic revision --autogenerate` (uses `script.py.mako`) to scaffold a new numbered file. The generated file lives in `versions/` and contains `upgrade()`/`downgrade()` where schema operations (via `op` helpers) are implemented. `alembic upgrade head` runs the entire revision chain, while `alembic downgrade <rev>` walks backwards.

## Integration

- **Flask/SQLAlchemy layers**: `env.py` imports `app.database.Base` and `app.models` to keep Alembic aware of the same declarative metadata that the backend uses. Any new model or table property should be reflected both in the ORM and in generated revisions.
- **Configuration**: `app.config.settings.database_url` drives both Alembic and the running Flask app so migrations use the same credentials/host as the services that consume the database.
- **Repository layout**: Alembic lives side-by-side with the Flask backend (`backend/app/`). Running `alembic` commands from the repo root respects the ini `prepend_sys_path = .`, allowing imports from `backend/app`. The versions directory can be extended with additional scripts, and Alembic keeps track of applied revisions in its own `alembic_version` table in the database.
