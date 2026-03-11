# ops/print_agent/

## Responsibility

- Hosts the standalone print agent that watches for picklist print jobs, fetches job payloads from the backend API, renders them via SumatraPDF, and reports success/failure.
  The module lives apart from the main Flask backend so it can run on a print workstation with access to a physical printer and printed job spool directory.

## Design

- Single-module agent centered on `PicklistPrintAgent`, which wires together configuration, HTTP/session management (`requests.Session`), socket.io pub/sub, and OS-level print execution via `subprocess`.
- Config is environment-driven (load `.env` plus OS vars) so deployments can target different printers, API endpoints, and polling intervals.
- A mix of push (socket.io `print_job_available` wake-up) and pull (HTTP polling every `POLL_SECONDS`) keeps the job loop responsive even when websockets cannot be established.
- Jobs are downloaded into a local spool directory before printing and removed afterward to keep disk usage bounded.

## Flow

- `main()` boots logging, builds a `Config`, instantiates `PicklistPrintAgent`, and calls `run()`.
- `run()` tries to connect to the backend socket.io server (`/socket.io`), registering handlers that set a wake event whenever a `print_job_available` broadcast arrives or when the socket connects/reconnects.
- Regardless of socket state, the loop repeatedly waits on the wake event (timed by `POLL_SECONDS`) and calls `process_available_jobs()` whenever it is set.
- `process_available_jobs()` loops claiming jobs via `POST /api/system/print-agent/claim-next`. Each claimed job triggers: download via the backend-provided `download_url`, silent printing through SumatraPDF (`-print-to`), and status reporting (`/complete` or `/fail`).
- Errors while printing/reporting are logged and reported back to the backend; job PDFs are cleaned up whether the run succeeds or fails.

## Integration

- Talks to the main backend API for job lifecycle endpoints (`claim-next`, job completion/failure) and for downloading PDF blobs; the API enforces authentication via `AGENT_TOKEN`.
- Listens on the backend socket.io channel `print_jobs` so the agent wakes immediately when new jobs are enqueued, while a fallback poll loop keeps it alive if websockets fail.
- Assumes the backend exposes a `print-agent` namespace under `/api/system` and the `download_url` payload points back to that same domain.
- Operates independently of the Flask/React stack; it simply drives printer hardware and leaves UI/interactivity to the main app, so the backend can remain stateless regarding printers. 
