# AGENTS.md — Agentic Coding Guide (techhub-dns-dev)

Operational contract for coding agents in this repository.
Keep changes fast, low-risk, and repo-specific.

## Rule Sources and Precedence

1. Direct user/developer instructions in the active task
2. This `AGENTS.md`
3. Repo automation/config rules (if present)

## Cursor / Copilot Rule Files (checked)

- `.cursor/rules/**`: **absent**
- `.cursorrules`: **absent**
- `.github/copilot-instructions.md`: **absent**

No external Cursor/Copilot override files are active. Use this document as source of truth.

## Repository Map

- `frontend/` — Vite + React + TypeScript UI
- `frontend/dist/` — production static bundle served by Flask
- `backend/` — Flask API and server-side logic
- `backend/app/main.py` — Flask entrypoint + SPA static serving
- `backend/app/api/middleware.py` — centralized API error serialization
- `backend/app/utils/exceptions.py` — `DNSApiError` and domain exceptions
- `backend/tests/` — mixed script-style tests + pytest-compatible tests
- `backend/alembic.ini` — Alembic config
- `scripts/deploy.sh` — PythonAnywhere deployment script (**do not run locally**)

## Environment Setup

### Frontend setup

```bash
cd frontend
npm ci
```

### Backend setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

## Authoritative Build / Lint / Test Commands

### Frontend (`frontend/`)

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm run preview
npm run test
```

Single-test patterns (Vitest):

```bash
# single file
npm run test -- src/utils/timezone.test.ts

# single named test
npm run test -- src/utils/timezone.test.ts -t "formats winter UTC timestamps in Central time"
```

### Backend (`backend/`)

Runtime + migrations:

```bash
python -m app.main
curl http://localhost:8000/health
alembic upgrade head
```

Testing:

```bash
# script-style tests (fast checks, no pytest required)
python tests/test_error_handling.py
python tests/test_db.py
python tests/test_picklist_service.py

# pytest flow
python -m pip install pytest
pytest -q
```

Single-test patterns:

```bash
# single file
pytest -q tests/test_error_handling.py

# single test function
pytest -q tests/test_error_handling.py::test_validation_error

# subset by expression
pytest -q tests/test_error_handling.py -k "validation"

# script-style single file
python tests/test_picklist_service.py
```

## Verification Expectations by Change Type

- Frontend-only change: run `npm run lint`, `npx tsc --noEmit`, and targeted frontend tests
- Backend-only change: run impacted script/pytest tests and smoke-check startup
- Full-stack/API contract change: run frontend + backend validations
- Error-handling changes: always run `python tests/test_error_handling.py`

## Code Style Guidelines

### Imports

TypeScript / React:
- Order imports: third-party → internal aliases/absolute → relative
- Remove unused imports; keep import blocks stable
- Use type-only imports when applicable (`import type { Foo } ...`)

Python:
- Order imports: stdlib → third-party → local app modules
- Avoid wildcard imports
- Avoid side-effect-only imports unless established in file pattern

### Formatting

- Respect existing formatter/linter output in touched files
- Avoid unrelated reformatting churn
- Prefer guard clauses / early returns over deep nesting

### Typing and Data Contracts

Frontend TypeScript:
- Preserve strict typing; avoid introducing `any`
- Add explicit types for exported/shared APIs
- Prefix intentionally unused params/locals with `_`

Backend Python:
- Parse/coerce external input at boundaries
- Keep internal flow operating on trusted shapes

### Naming

- Use intent-revealing names (`resolveLocation`, `selectedDnsRecord`)
- Avoid vague names (`data`, `temp`, `handleThing`) unless context is trivial
- Booleans should read as predicates (`isReady`, `hasErrors`, `canTransition`)

### Error Handling

- Never swallow errors (`except: pass`, empty catch blocks)
- For expected API failures, use `DNSApiError` subclasses
- Let middleware serialize API errors; avoid route-specific duplicate JSON formats
- Return actionable messages and structured `details` where useful
- Fail fast on invalid states; do not propagate partially invalid objects

## Backend/Frontend Integration Notes

- Flask serves `frontend/dist` in production
- If `frontend/dist` is missing, backend returns a JSON hint to build frontend
- Local full-stack smoke check:

```bash
cd frontend && npm run build
cd ../backend && python -m app.main
```

## Deployment and Safety Notes

- **Do not run `scripts/deploy.sh` locally** (PythonAnywhere-specific)
- Do not execute deployment actions unless explicitly requested
- Do not use destructive git operations (force push/reset) unless explicitly requested
