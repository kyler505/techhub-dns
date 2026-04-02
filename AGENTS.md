# AGENTS.md — techhub-dns-dev Agent Guide

Repo-specific instructions for coding agents.

## Rule Precedence
1. Active system/developer/user task instructions
2. This `AGENTS.md`
3. Tool/config defaults in repo (eslint, tsconfig, test runners)

## Cursor/Copilot Rule Status
Audited in repo root:
- `.cursor/rules/**` → **not present**
- `.cursorrules` → **not present**
- `.github/copilot-instructions.md` → **not present**

Result: no additional Cursor/Copilot instruction layers are active.
`AGENTS.md` is the effective repo instruction file.

## Repository Map
- `frontend/` — React 18 + TypeScript + Vite
- `frontend/package.json` — authoritative frontend scripts
- `frontend/.eslintrc.cjs` — ESLint config
- `frontend/tsconfig.json` — strict TS config
- `backend/` — Flask + SQLAlchemy + Socket.IO
- `backend/app/main.py` — backend entrypoint (`python -m app.main`)
- `backend/tests/` — pytest-style + script-style tests
- `backend/requirements.txt` — Python deps
- `backend/alembic.ini` — migrations
- `scripts/deploy.sh` — deployment-only script

## Working Directory Expectations
- Run frontend commands from `frontend/`.
- Run backend commands from `backend/`.
- Many backend tests rely on `sys.path.append('.')`, so CWD matters.

## Setup

### Frontend
```bash
cd frontend
npm ci
```

### Backend
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

## Build / Lint / Type / Test Commands

### Frontend (from `frontend/`)
Commands from `frontend/package.json`:
```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm run preview
npm run test
```

Notes:
- `npm run test` = `vitest run` (non-watch).
- `npm run build` = `tsc && vite build`.

Frontend single-test patterns:
```bash
# single file
npm run test -- src/utils/timezone.test.ts

# single named test
npm run test -- src/utils/timezone.test.ts -t "formats winter UTC timestamps in Central time"
```

### Backend (from `backend/`)
No central script runner is configured; use direct commands.

Runtime + health:
```bash
python -m app.main
curl http://localhost:8000/health
```

Migrations:
```bash
alembic upgrade head
```

Tests:
```bash
# install pytest if needed
python -m pip install pytest

# full pytest run
pytest -q

# script-style tests used in this repo
python tests/test_error_handling.py
python tests/test_picklist_service.py
python tests/test_db.py
```

Backend single-test patterns:
```bash
# single pytest file
pytest -q tests/test_error_handling.py

# single pytest function
pytest -q tests/test_error_handling.py::test_validation_error

# filtered subset
pytest -q tests/test_error_handling.py -k "validation"

# single script-style file
python tests/test_picklist_service.py
```

## Verification Expectations
- Frontend-only change: `npm run lint`, `npx tsc --noEmit`, targeted vitest.
- Backend-only change: run impacted backend tests (pytest or script-style).
- API/shared-model change: run both frontend and backend validations.
- Error handling changes: always run `python tests/test_error_handling.py`.

## Code Style Guidelines

### Imports
TypeScript/React:
- Order: external packages → internal modules → relative modules.
- Use `import type` for type-only imports.
- Keep imports minimal; remove unused imports.

Python:
- Order: stdlib → third-party → local `app.*` imports.
- Avoid wildcard imports.
- Avoid side-effect imports unless framework wiring requires them.

### Formatting & Structure
- Follow existing style in touched files; avoid unrelated format churn.
- Prefer guard clauses/early returns over deep nesting.
- Keep functions small and deterministic where practical.

### Types / Contracts
Frontend TypeScript (`strict: true`, `noUnusedLocals`, `noUnusedParameters`):
- Do not introduce new `any` unless unavoidable and justified inline.
- Add explicit types for exported/shared APIs.
- Prefix intentionally unused variables/params with `_` (ESLint-compatible).

Backend Python:
- Parse external/request data at boundaries.
- Keep internal logic on trusted normalized data.
- Preserve exception contracts consumed by API middleware.

### Naming
- Use intent-revealing names (`resolveLocationFromRemarks`, `isShippingFlow`).
- Boolean names should read as predicates (`isReady`, `hasSignature`, `canAdvance`).
- Avoid vague names (`data`, `temp`, `obj`) except in tiny local scopes.

### Error Handling
- Never swallow errors (`except: pass`, empty `catch`).
- Use typed domain/API exceptions (e.g., `DNSApiError` family) for expected failures.
- Let centralized middleware serialize API errors.
- Fail fast on invalid states; do not propagate partial/invalid objects.

## Integration Notes
- Backend serves `frontend/dist` when available.
- If `frontend/dist` is missing, backend root returns JSON guidance.
- Full-stack smoke check:
```bash
cd frontend && npm run build
cd ../backend && python -m app.main
```

## Safety Notes
- Do not run `scripts/deploy.sh` unless explicitly requested.
- Avoid destructive git operations unless explicitly requested.
- Keep edits scoped to task-relevant areas.
