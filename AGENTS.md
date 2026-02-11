# Agent Guide (Repo-Specific)

This repo has no AI tool config files like `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md`. Treat this document as the source of truth.

## Layout
- `frontend/`: Vite + React + TypeScript.
- `frontend/dist/`: Production build output (served by Flask).
- `backend/`: Flask app and API.
- `backend/app/main.py`: Flask entrypoint; serves `frontend/dist` in production.
- `backend/app/api/middleware.py`: Registers error handlers (serializes `DNSApiError`).
- `backend/app/utils/exceptions.py`: `DNSApiError` and subclasses.
- `backend/tests/test_error_handling.py`: Scriptable tests for error handling.
- `scripts/deploy.sh`: PythonAnywhere deploy script (builds frontend, reloads app).
- `.github/workflows/deploy-pythonanywhere.yml`: Deploy workflow (SSH; uploads deploy.log on failure).

## Runtime Notes
- Production serves the React SPA from `frontend/dist` via `backend/app/main.py`.
- If `frontend/dist` is missing locally, `backend/app/main.py` returns a JSON hint telling you to build the frontend.
- `/health` exists for simple uptime checks.
- `backend/app/api/middleware.py` owns JSON error shaping (do not fork error formats per endpoint).

## Commands
Run commands from the repo root unless noted.

### Frontend
Scripts are defined in `frontend/package.json`.

```bash
cd frontend
npm ci
npm run dev
npm run lint                 # fails on warnings (max-warnings 0)
npm run build                 # exactly: tsc && vite build
npm run preview

npx tsc --noEmit              # typecheck only
npm run lint -- src/App.tsx   # single-file / targeted lint
```

### Backend
There is no single pinned backend runner; use a virtualenv.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r backend/requirements.txt

cd backend
python -m app.main
curl http://localhost:8000/health

# DB migrations (Alembic; uses backend/alembic.ini)
alembic upgrade head
```

### Tests
`pytest` is not pinned in `backend/requirements.txt`.

```bash
cd backend

# Scriptable tests (no pytest required)
python tests/test_error_handling.py
python tests/test_db.py
python tests/test_picklist_service.py

# Optional pytest
python -m pip install pytest
pytest -q tests/test_error_handling.py
pytest -q tests/test_error_handling.py -k "validation"   # run a single test by substring
```

## Deployment (PythonAnywhere)
- GitHub Actions deploys via SSH: `.github/workflows/deploy-pythonanywhere.yml`.
- `scripts/deploy.sh` runs on PythonAnywhere; it installs deps, builds the frontend (`npm run build`), and reloads by touching the WSGI file.
- No build artifacts are uploaded; the frontend build happens on PythonAnywhere.
- On failure, the workflow uploads `deploy.log` as an artifact.
- PythonAnywhere logs: `~/logs/<domain>.error.log`, `~/logs/<domain>.server.log`.
- Do not run `scripts/deploy.sh` locally; it assumes PythonAnywhere paths and hard-resets to `origin/main`.

## Error Handling Conventions
- Expected API failures: raise `DNSApiError` (or subclasses) from `backend/app/utils/exceptions.py`.
- Do not hand-roll JSON error payloads per-route; rely on `backend/app/api/middleware.py` handlers.
- `register_error_handlers` serializes `DNSApiError` into `ErrorResponse` and returns `jsonify(response.model_dump()), error.status_code`.
- If catching broad exceptions around external I/O, re-raise as `ExternalServiceError` (or another `DNSApiError`) with actionable context.
- Avoid silent failures (empty `catch`/`except` blocks).
- Do not return SPA HTML for API paths; `backend/app/main.py` guards `/api` and returns a JSON 404 for missing endpoints.

## Local Build Flow
If you want the backend to serve the built SPA locally:

```bash
cd frontend
npm run build

cd ../backend
python -m app.main
```

## Code Conventions

### General
- Keep changes minimal and local; match existing patterns before introducing new ones.
- Prefer early guard clauses over nested conditionals.
- Parse inputs at the boundary; keep internal code operating on trusted types.
- Fail fast with descriptive errors; do not silently swallow exceptions.
- Avoid drive-by refactors (especially formatting-only changes) unless they reduce risk for the current change.
- Keep secrets out of code and logs (.env files, credentials, tokens).
- Keep edits ASCII-only unless the file already contains non-ASCII and needs it.
- Do not commit, push, or deploy unless explicitly requested.

### Frontend (TypeScript / React)
- `frontend/tsconfig.json` is strict: do not leave unused imports/locals/params.
- ESLint fails on warnings (`--max-warnings 0`); fix warnings before calling work "done".
- Prefix intentionally-unused vars/args with `_`.
- Prefer type-only imports where appropriate (`import type { Foo } from "..."`).
- Prefer explicit return types for exported functions; avoid `any` unless there is no reasonable alternative.
- Hooks: even if some rules are relaxed, write hooks as if rules-of-hooks + exhaustive-deps were enabled.
- Components: name props/handlers intentionally (`onSubmitOrder`, not `handle`/`doThing`).
- Errors: surface API failures to the UI deliberately (empty catch blocks are not acceptable).

### Backend (Python / Flask)
- Imports: standard library, third-party, then local imports.
- Prefer explicit, actionable `message` strings; use `details` for structured context.
- If you must catch a broad exception around external I/O, wrap it as a `DNSApiError` subclass with context.

## Database (MySQL / PythonAnywhere)
Warning: do not print or paste secrets (avoid `cat backend/.env`, logging `DATABASE_URL`, or sharing passwords).

```bash
cd backend
python -c "from app.config import settings; from sqlalchemy.engine.url import make_url; u = make_url(settings.database_url); print(f'host={u.host} port={u.port or 3306} user={u.username} db={u.database}')"
mysql -h <db-host> -u <db-user> -p <db-name>   # enter password when prompted
```

## Working Agreements
- Keep changes minimal and follow existing patterns; avoid formatting-only churn.
- Frontend TS is strict; do not leave unused imports/locals/params (prefix intentionally-unused with `_`).
- Frontend changes: `cd frontend && npm run lint && npm run build`.
- Backend error-handling changes: `cd backend && python tests/test_error_handling.py`.
- Deployment changes: sanity-check `scripts/deploy.sh` assumptions and `.github/workflows/deploy-pythonanywhere.yml` steps.
- Do not run `scripts/deploy.sh` locally.
- Default loop: read relevant files -> implement minimal change -> verify.
- After implementing requested changes, run relevant verification (tests/lint/build as applicable), then commit and push so the user can smoke test.
- If the backend hints that `frontend/dist` is missing, run a frontend build and retry.
