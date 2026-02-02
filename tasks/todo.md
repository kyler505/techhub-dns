# Frontend Build Refactor (PythonAnywhere)

- [x] Restate goal + acceptance criteria
- [x] Locate existing implementation / patterns
- [x] Design: minimal approach + key decisions
- [x] Implement smallest safe slice
- [x] Add/adjust tests (if needed)
- [ ] Run verification (deploy script run)
- [x] Summarize changes + verification story
- [ ] Record lessons (if any)

## Acceptance Criteria
- GitHub Actions workflow for frontend build is removed.
- `scripts/deploy.sh` builds the frontend on PythonAnywhere before reload.
- Deployment docs reflect PythonAnywhere build flow (no local build requirement).

## Working Notes
- Node and npm are already in PATH on PythonAnywhere.
- Build runs in `frontend` using `npm ci` then `npm run build`.

## Checkpoint Notes
- Removed GitHub Actions workflow for frontend deploy.
- Added frontend build to `scripts/deploy.sh`.
- Updated PythonAnywhere deployment docs to reflect server-side build.

## Results
- `scripts/deploy.sh` builds frontend on PythonAnywhere before reload.
- `.github/workflows/deploy_frontend_pythonanywhere.yml` removed.
- Deployment docs updated to reflect new flow.

## Verification
- Pending (run deploy script on PythonAnywhere).
