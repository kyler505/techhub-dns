# Tag Request Integration Plan

## Goal
Integrate the canopy tag-request flow into the DNS web app so that:
- Clicking the asset tagging button triggers a blocking tag request (WebDAV upload + Teams notification).
- Users confirm before starting the request and after request completion.
- Post-confirmation (tags printed) is non-blocking so users can return later.

## Scope Overview
- Backend: add tag-request endpoint + service to send requests; keep existing confirm-tag endpoint.
- Frontend: add two modals, new API call, and request-sent UI state.
- Config: add WebDAV + Teams settings and Key Vault secret name.

## Backend Tasks
1) Add endpoint: `POST /orders/<id>/tag/request`
   - Purpose: send tag request (blocking).
   - Behavior:
     - Build JSON payload from order data and `asset_tag_serials`.
     - Upload JSON to WebDAV with timestamped filename.
     - Post Teams/Power Automate Adaptive Card.
     - Return response payload with status + filename.
   - Do not set `tagged_at` yet.

2) Create service module: `tag_request_service.py`
   - Responsibilities:
     - Fetch WebDAV password from Azure Key Vault (use existing service principal pattern in `inflow_service.py`).
     - WebDAV upload (pycurl or requests, TLS verified).
     - Teams webhook call (requests).
   - Return structured status for UI (success/failure for WebDAV and Teams).

3) Keep existing confirm endpoint (`POST /orders/<id>/tag`)
   - Use it to mark `tagged_at`, `tagged_by`, `tag_data` once tags are printed.

4) Persist tag request metadata
   - Store in `tag_data` or new fields:
     - `tag_request_sent_at`, `tag_request_filename`, `tag_request_status`.
   - Enables UI to show request-sent state after reload.

## Frontend Tasks
5) Pre-confirmation modal
   - On Asset Tagging click:
     - Show modal: "Start tag request?"
     - Confirm -> call new `startTagRequest` API.
     - Cancel -> no action.

6) Blocking request + status
   - During request:
     - Show loading state (spinner, disable button).
     - Handle errors with clear message.

7) Post-confirmation modal
   - After request success:
     - Modal: "Tag request sent. Have tags been printed?"
     - Yes -> call `tagOrder` (existing endpoint).
     - Not yet -> close modal, no changes.

8) Persistent request-sent UI state
   - If request was sent but order not tagged:
     - Show banner or CTA: "Tag request sent at ..." + "Mark tags printed".

## Config Changes
Add settings in backend config (env-driven):
- `webdav_base_url`
- `webdav_username`
- `webdav_password_secret_name`
- `webdav_target_path`
- `teams_workflow_url`
- `teams_workflow_shared_secret` (optional)

## Suggested JSON Payload (example)
- `order_id`, `order_number`, `customer`, `ship_to`
- `asset_tag_serials` (from `inflow_service.get_asset_tag_serials`)
- Optional: `requested_by`, `requested_at`

## Testing / Validation
- Start tag request -> verify WebDAV file created (timestamped JSON).
- Verify Teams notification delivered.
- Confirm tags printed sets `tagged_at` and allows picklist flow.
- Not yet leaves order in request-sent but untagged state.
