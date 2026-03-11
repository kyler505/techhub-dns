# backend/app/api/

## Responsibility

- Owns the Flask-side API surface (blueprints, middleware, helpers) that the `backend` app exposes under `/api/*` and `/health`.
- Coordinates shared concerns such as authentication/authorization, rate limiting, database dependency management, error shaping, and Socket.IO events for real-time updates.

## Design Patterns

- **Blueprint-based routing**: Each domain area (`orders`, `inflow`, `audit`, `delivery_runs`, etc.) ships its own `Blueprint` under `backend/app/api/routes/` and is mounted in `app.main` with a `/api/...` prefix so handlers stay small, focused, and testable.
- **Middleware-first wiring**: `register_error_handlers` centrally registers Flask error handlers (`DNSApiError`, 400/404/500, catch-all) that wrap responses in the shared `ErrorResponse` schema and log diagnostics before returning JSON. `init_auth_middleware` hooks a `before_request` that scopes session state into `flask.g`, validates SAML sessions, enforces public vs. protected paths, enforces rate limits for admin routes, and schedules maintenance ticks for authenticated API calls.
- **Context managers for dependencies**: `dependencies.get_database` wraps `SessionLocal` so callers can grab/close sessions with a `with` block, and route handlers typically call `get_db()` or `get_db_session()` through helper services instead of managing lifetimes manually.
- **Socket event helpers**: `register_socket_events` encapsulates join/leave/connect/disconnect/error events (including header logging) so the `SocketIO` instance imported in `app.main` can simply decorate event handlers once. Routes like `orders` reuse the global `socketio` object for ad-hoc broadcasts to rooms.

## Data & Control Flow

1. Flask bootstraps in `backend/app/main.py`: CORS + ProxyFix configured, Socket.IO instance created, socket events registered, error and auth middleware installed, then each blueprint is registered under its path prefix. `GET /health` and SPA-serving routes live in the same module for shared config.
2. Incoming HTTP requests hit Flask before-request hooks: `init_auth_middleware` short-circuits static/public routes, loads the SAML session via `get_db()`/`saml_auth_service`, attaches `g.user_*` context, enforces auth/decorators (`require_auth`, `require_admin`), and applies rate-limits plus maintenance scheduling before the route executes.
3. Routes live in `backend/app/api/routes/` (e.g., `orders.py`, `analytics.py`, `system.py`), where handlers open database contexts (`get_db()`), hydrate `Service` layers, validate Pydantic models (schemas in `app.schemas.*`), and return `jsonify(...)`. Common helpers (broadcasting via `socketio`, serializing responses) live near the route definitions but rely on shared services/models.
4. Errors bubble up to middleware. Custom `DNSApiError`s return structured payloads from `ErrorResponse`; unhandled Flask errors hit the 400/404/500 handlers, and the generic exception handler rescues anything else while still attempting to detect transient DB throttling (`_database_capacity_dns_error`). Each handler logs context (often with a UUID `request_id`) before returning JSON+status.
5. WebSocket events are registered once via `register_socket_events(socketio)` in `app.main`. Event handlers log forwarded headers, handle room joins/leaves, and emit status back to clients; `orders` (and other modules) import the shared `socketio` object directly for broadcasting updates.

## Integration Points

- `backend/app/main.py` wires together this package with the wider backend app: it imports each route module, registers its blueprint, configures Socket.IO, and attaches middleware before running the app.
- Route modules integrate with shared services (`OrderService`, `InflowService`, etc.), schemas (`app.schemas.*`), and models/ORM that live elsewhere in the backend; they keep request parsing in the route layer while delegating persistence/business logic to service classes.
- Authentication depends on `app.services.saml_auth_service`, `SystemSettingService`, and `schedule_maintenance_tick_if_needed`, but the middleware exposes helpers (`require_auth`, `require_admin`, `get_current_user_email`) for route code to reuse.
- Socket helpers expose `register_socket_events` for the global `SocketIO` instance and are consumed directly by routes that need to emit real-time updates.
- `dependencies.get_database` is consumed per-request/service and keeps SQLAlchemy session lifecycle consistent across the package.
