# ops/

This directory is an operational namespace: it does not contribute to the Flask/React stack directly but instead hosts standalone tooling that runs on dedicated infrastructure. The only concrete subsystem inside `ops/` today is `print_agent`, which lives alongside this codemap and delivers the print automation flow described below.

## Responsibility

- Keep print-focused infrastructure isolated from the main API so it can run on workstations that have local printer access; the agent claims picklist jobs, downloads PDFs, and drives a physical printer. The repo-level surface for this work is in `ops/print_agent/README.md`, `ops/print_agent/agent.py`, and its `requirements.txt`/`.env` guidance.

## Design Patterns

- `print_agent` is a tiny, single-module Python service centered on `PicklistPrintAgent` inside `agent.py`; it wires configuration, HTTP/session management, the Socket.IO pub/sub layer, and SumatraPDF-based printing together in a single flow.
- Configuration follows the Twelve-Factor pattern: copy `.env.example`, set `API_BASE_URL`, `AGENT_TOKEN`, `PRINTER_NAME`, `SUMATRA_PDF_PATH`, `POLL_SECONDS`, and `SPOOL_DIR`, and allow overriding via the environment. `README.md` documents this setup so the tool can be deployed to different printers with different backend endpoints.
- Dependencies are pinned via `requirements.txt`, keeping the standalone agent lightweight and portable to a Windows workstation where SumatraPDF and the printer drivers live.

## Data & Control Flow

- `agent.py` boots the agent in `main()`, which sets up logging, instantiates the configuration, and calls `PicklistPrintAgent.run()`.
- `run()` races two concerns: connect to the backend Socket.IO `print_jobs` room (to wake immediately when a new job arrives) and keep a timed poll loop (every `POLL_SECONDS`) as a fallback whenever websockets are unavailable.
- Whenever the wake event fires, the agent calls `process_available_jobs()`, which POSTs to `/api/system/print-agent/claim-next`, downloads the returned `download_url` into `SPOOL_DIR`, prints it via SumatraPDF with `-print-to`, reports success or failure back through the completion/failure endpoints, and deletes the spooled PDF.

## Integration Points

- Talks directly to the backend API for `print-agent` lifecycle endpoints (`claim-next`, `/complete`, `/fail`) and for downloading job PDFs; every HTTP request carries `AGENT_TOKEN` for authentication.
- Subscribes to the backend’s Socket.IO `print_jobs` room so the agent can wake instantly on the `print_job_available` broadcast while the polling loop keeps it operational if sockets drop.
- Relies on SumatraPDF (configured via `SUMATRA_PDF_PATH`) and the designated physical printer (`PRINTER_NAME`) because it runs outside the web UI; it also needs write access to `SPOOL_DIR` for temporary PDFs and the ability to execute the SumatraPDF CLI via `subprocess`.
- Leaves UI and API work to the Flask backend; the agent simply calls the same API domain pointed to by `API_BASE_URL` and never serves HTTP itself.
