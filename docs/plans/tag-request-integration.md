# Canopy Orders Asset Tagging

This repo supports asset tagging requests via the Canopy Orders uploader flow.

## Flow Overview
1) Candidate selection
   - UI (or operator) lists orders eligible for tagging requests via:
     - `GET /orders/tag-request/candidates`
   - Eligibility (high level): picked, not yet tagged, and no prior request metadata.

2) Upload batch to Canopy Orders
   - Operator submits a list of order numbers to:
     - `POST /api/system/canopyorders/upload`
   - Backend uploads a JSON payload (order numbers) to the Canopy Orders WebDAV endpoint and optionally notifies Teams.

3) Persist request metadata
   - Backend stores request metadata under `order.tag_data`:
     - `canopyorders_request_sent_at`
     - `canopyorders_request_filename`
     - `canopyorders_request_uploaded_url`
     - `canopyorders_request_sent_by`

## Backwards-Compatible Dedupe
Some endpoints treat legacy `order.tag_data` keys as "already requested" for dedupe/display only:
- `tag_request_sent_at`
- `tag_request_status` ("sent")

No endpoint in this repo should generate new values for the legacy `tag_request_*` keys.

## Configuration (env vars)
Required:
- `CANOPYORDERS_STORE_BASE`
- `CANOPYORDERS_USERNAME`
- WebDAV password via either:
  - `CANOPYORDERS_PASSWORD`, or
  - `AZURE_KEY_VAULT_URL` + `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` + `CANOPYORDERS_PASSWORD_SECRET_NAME`

Optional:
- `CANOPYORDERS_DAV_ROOT_PATH` (default: `/dav`)
- `CANOPYORDERS_BASE_DIR` (default: `/content/canopyorders`)
- `CANOPYORDERS_USER_AGENT`
- `CANOPYORDERS_TEAMS_WORKFLOW_URL`
- `CANOPYORDERS_TEAMS_SHARED_SECRET`
