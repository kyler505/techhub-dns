# TechHub Delivery Workflow - Technical Documentation

Complete technical documentation for the TechHub Delivery Workflow application covering all system components, features, APIs, and implementation details.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Order Synchronization](#order-synchronization)
3. [Location Intelligence](#location-intelligence)
4. [Order Status Workflow](#order-status-workflow)
5. [QA Checklist System](#qa-checklist-system)
6. [Delivery Run Management](#delivery-run-management)
7. [Shipping Workflow](#shipping-workflow)
8. [PDF Generation](#pdf-generation)
9. [Email Service](#email-service)
10. [Teams Notification Service](#teams-notification-service)
11. [Document Signing](#document-signing)
12. [Real-time Updates](#real-time-updates)
13. [Audit Logging](#audit-logging)
14. [Authentication & Sessions](#authentication--sessions)
15. [SharePoint Storage](#sharepoint-storage)
16. [Admin Dashboard](#admin-dashboard)
17. [API Reference](#api-reference)
18. [Database Schema](#database-schema)
19. [Configuration Reference](#configuration-reference)
20. [Troubleshooting](#troubleshooting)

---

## System Architecture

### Overview

The TechHub Delivery Workflow is a full-stack application with a Flask backend serving a React frontend, integrated with multiple external services.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Orders  │ │    QA    │ │ Delivery │ │ Shipping │ │  Admin   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │ HTTP/REST │ WebSocket (Socket.IO)
                    ▼           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Flask)                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          API Routes                                   │   │
│  │  orders.py │ inflow.py │ delivery_runs.py │ auth.py │ system.py     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          Services                                     │   │
│  │  order_service │ inflow_service │ delivery_run_service │ pdf_service │   │
│  │  graph_service │ email_service │ teams_recipient_service             │   │
│  │  saml_auth_service │ sharepoint_service │ audit_service              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          Utils                                        │   │
│  │  building_mapper.py                                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┬───────────────┬───────────────┐
    ▼               ▼               ▼               ▼               ▼
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  MySQL  │   │ Inflow  │   │  Graph  │   │ ArcGIS  │   │SharePoint│
│Database │   │  API    │   │  API    │   │ Service │   │ Storage  │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
```

### Backend Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── orders.py          # Order CRUD and status management
│   │   │   ├── inflow.py          # Inflow sync and webhooks
│   │   │   ├── delivery_runs.py   # Delivery run management
│   │   │   ├── auth.py            # SAML authentication
│   │   │   ├── system.py          # Admin and system endpoints
│   │   │   ├── audit.py           # Audit log queries
│   │   │   └── sharepoint.py      # SharePoint operations
│   │   └── middleware/            # Auth middleware, error handlers
│   ├── models/
│   │   ├── order.py               # Order model
│   │   ├── delivery_run.py        # Delivery run model
│   │   ├── audit_log.py           # Audit log model
│   │   ├── inflow_webhook.py      # Webhook tracking
│   │   ├── user.py                # User model
│   │   └── session.py             # Session model
│   ├── services/
│   │   ├── order_service.py       # Order business logic
│   │   ├── inflow_service.py      # Inflow API integration
│   │   ├── delivery_run_service.py # Delivery run logic
│   │   ├── graph_service.py       # Microsoft Graph API
│   │   ├── email_service.py       # Email via Graph
│   │   ├── teams_recipient_service.py # Teams notifications
│   │   ├── pdf_service.py         # PDF generation
│   │   ├── saml_auth_service.py   # SAML authentication
│   │   ├── sharepoint_service.py  # SharePoint storage
│   │   └── audit_service.py       # Audit logging
│   ├── utils/
│   │   └── building_mapper.py     # ArcGIS building code extraction
│   ├── schemas/                   # Pydantic schemas
│   ├── config.py                  # Configuration management
│   ├── database.py                # Database connection
│   ├── main.py                    # Flask application
│   └── scheduler.py               # APScheduler background tasks
├── scripts/
│   ├── database_manager.py        # Database management tool
│   └── manage_inflow_webhook.py   # Webhook management
└── alembic/                       # Database migrations
```

### Frontend Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts              # Axios configuration
│   │   ├── orders.ts              # Order API calls
│   │   ├── inflow.ts              # Inflow sync API
│   │   ├── deliveryRuns.ts        # Delivery run API
│   │   ├── settings.ts            # System settings API
│   │   └── sharepoint.ts          # SharePoint API
│   ├── components/
│   │   ├── OrderTable.tsx         # Order listing table
│   │   ├── OrderDetail.tsx        # Order detail view
│   │   ├── StatusBadge.tsx        # Status display
│   │   ├── StatusTransition.tsx   # Status change dialog
│   │   ├── Filters.tsx            # Filter controls
│   │   ├── LiveDeliveryDashboard.tsx # Real-time dashboard
│   │   ├── CreateDeliveryDialog.tsx  # Delivery run creation
│   │   └── ProtectedRoute.tsx     # Auth route wrapper
│   ├── pages/
│   │   ├── Orders.tsx             # Orders dashboard
│   │   ├── OrderDetailPage.tsx    # Order detail page
│   │   ├── OrderQAChecklist.tsx   # QA checklist page
│   │   ├── DeliveryDashboard.tsx  # Delivery overview
│   │   ├── DeliveryRunDetailPage.tsx # Delivery run detail
│   │   ├── PreDeliveryQueue.tsx   # Pre-delivery queue
│   │   ├── InDelivery.tsx         # In-delivery tracking
│   │   ├── Shipping.tsx           # Shipping workflow
│   │   ├── DocumentSigningPage.tsx # Document signing
│   │   ├── Admin.tsx              # Admin panel
│   │   ├── Sessions.tsx           # Session management
│   │   └── Login.tsx              # Login page
│   ├── hooks/
│   │   ├── useOrders.ts           # Order data hook
│   │   ├── useOrdersWebSocket.ts  # WebSocket hook
│   │   ├── useDeliveryRuns.ts     # Delivery runs hook
│   │   └── useStatusTransition.ts # Status transition hook
│   ├── contexts/
│   │   └── AuthContext.tsx        # Authentication context
│   └── types/
│       ├── order.ts               # TypeScript types
│       └── websocket.ts           # WebSocket types
└── public/
```

---

## Order Synchronization

### Inflow API Integration

The system synchronizes orders from Inflow Cloud inventory management through two mechanisms:

#### Polling Sync

**Service**: `backend/app/services/inflow_service.py`
**Scheduler**: `backend/app/scheduler.py`

**Process**:
1. APScheduler triggers sync at configured interval (default: 20 minutes)
2. Fetches orders with `inventoryStatus="started"` (picked orders)
3. Processes up to 3 pages (100 orders per page)
4. For each order:
   - Extracts order metadata (ID, recipient, location, PO number)
   - Parses order remarks for alternative delivery locations
   - Extracts building code using ArcGIS
   - Creates or updates order in database
   - Sets initial status to `Picked`

**Configuration**:
```env
INFLOW_POLLING_SYNC_ENABLED=true
INFLOW_POLLING_SYNC_INTERVAL_MINUTES=20
```

#### Webhook Sync

**Endpoint**: `POST /api/inflow/webhook`

Real-time order updates via Inflow webhooks:

1. Inflow sends webhook on order creation/update
2. Backend verifies webhook signature
3. Processes order data immediately
4. Falls back to polling if webhooks fail

**Configuration**:
```env
INFLOW_WEBHOOK_ENABLED=true
INFLOW_WEBHOOK_URL=https://your-domain/api/inflow/webhook
INFLOW_WEBHOOK_EVENTS=["orderCreated","orderUpdated"]
INFLOW_WEBHOOK_AUTO_REGISTER=true
```

**Webhook Management**:
```bash
# List webhooks
python scripts/manage_inflow_webhook.py list

# Register webhook
python scripts/manage_inflow_webhook.py register \
  --url https://your-domain/api/inflow/webhook \
  --events orderCreated,orderUpdated

# Reset webhook
python scripts/manage_inflow_webhook.py reset \
  --url https://your-domain/api/inflow/webhook \
  --events orderCreated,orderUpdated
```

---

## Location Intelligence

### Building Code Extraction

**Service**: `backend/app/utils/building_mapper.py`

Maps addresses to TAMU building abbreviations using ArcGIS:

**Process**:
1. Check if location string contains known building code (e.g., "LAAH 424" → "LAAH")
2. If not found, query ArcGIS service with address
3. Match against building data attributes
4. Return building abbreviation or original address

**ArcGIS Endpoint**:
```
https://gis.cstx.gov/csgis/rest/services/IT_GIS/ITS_TAMU_Parking/MapServer/3/query
```

**Caching**: Building data cached for 24 hours to reduce API calls.

**Common Building Codes**:
| Code | Building |
|------|----------|
| ACAD | Academic Building |
| ZACH | Zachry Engineering Education Complex |
| LAAH | Liberal Arts and Humanities |
| MPHY | Mitchell Physics |
| BLOC | Blocker Building |
| HRBB | H.R. Bright Building |

### Order Remarks Parsing

**Service**: `backend/app/services/order_service.py`

Extracts alternative delivery locations from order notes:

**Patterns Matched**:
- "deliver to [location]"
- "delivery to [location]"
- "deliver at [location]"
- "located at [location]"
- "alternative location: [location]"

**Example**:
- Remarks: "Please deliver to LAAH 424"
- Extracted Location: "LAAH 424"
- Building Code: "LAAH"

---

## Order Status Workflow

### Status Definitions

| Status | Description |
|--------|-------------|
| `Picked` | Order synced from Inflow, awaiting prep steps |
| `QA` | QA checklist in progress |
| `PreDelivery` | All prep steps complete, ready for assignment |
| `InDelivery` | Assigned to active delivery run |
| `Shipping` | In shipping workflow (external delivery) |
| `Delivered` | Successfully delivered (terminal state) |
| `Issue` | Problem encountered, requires resolution |

### Workflow Transitions

**Local Delivery**:
```
Picked → QA → PreDelivery → InDelivery → Delivered
              ↓
            Issue → Picked/PreDelivery
```

**Shipping**:
```
Picked → QA → PreDelivery → Shipping → Delivered
              ↓
            Issue → Picked/PreDelivery
```

### Transition Validation

**Service**: `backend/app/services/order_service.py`

Valid transitions enforced by `_is_valid_transition()`:

| From | Valid To |
|------|----------|
| Picked | QA, PreDelivery, Issue |
| QA | PreDelivery, Issue |
| PreDelivery | InDelivery, Shipping, Issue |
| InDelivery | Delivered, Issue |
| Shipping | Delivered, Issue |
| Issue | Picked, PreDelivery |
| Delivered | (terminal) |

---

## QA Checklist System

### Overview

In-app quality assurance replacing Google Forms with workflow routing.

**Page**: `frontend/src/pages/OrderQAChecklist.tsx`
**Endpoint**: `POST /api/orders/{order_id}/qa`

### Checklist Items

| Item | Description |
|------|-------------|
| Order Verification | Confirm order details match Inflow |
| Asset Tag Check | Verify asset tags match serial numbers |
| Template Notifications | Confirm notifications were sent |
| Packaging Verification | Check proper packaging |
| Packing Slip | Verify packing slip accuracy |
| Electronic Documentation | Confirm digital records |
| Box Labeling | Verify box labels |
| QA Signature | Technician sign-off |
| **Delivery Method** | Select "Delivery" or "Shipping" |

### Workflow Routing

The **Delivery Method** selection determines workflow path:

- **"Delivery"**: Order follows local delivery workflow → `InDelivery`
- **"Shipping"**: Order follows shipping workflow → `Shipping`

### Prep Step Gating

Orders cannot advance to PreDelivery without completing:
1. Asset tagging (`tagged_at` not null)
2. Picklist generation (`picklist_generated_at` not null)
3. QA completion (`qa_completed_at` not null)

---

## Delivery Run Management

### Overview

Groups multiple orders into coordinated delivery runs with vehicle and runner tracking.

**Service**: `backend/app/services/delivery_run_service.py`
**Page**: `frontend/src/pages/DeliveryDashboard.tsx`

### Delivery Run Model

```python
class DeliveryRun:
    id: String(36)           # UUID
    name: String             # Auto-generated (e.g., "Morning Run 1")
    runner: String           # Assigned runner name
    vehicle: Enum            # 'van' or 'golf_cart'
    status: Enum             # 'Active', 'Completed', 'Cancelled'
    start_time: DateTime     # Run creation time
    end_time: DateTime       # Completion time
    orders: Relationship     # Assigned orders
```

### Run Creation Process

1. Select Pre-Delivery orders from queue
2. Assign runner and vehicle
3. System generates run name based on time:
   - Morning (before 12:00): "Morning Run N"
   - Afternoon (12:00-17:00): "Afternoon Run N"
   - Evening (after 17:00): "Evening Run N"
4. Orders transition to `InDelivery` status
5. WebSocket broadcasts update to all clients

### Vehicle Management

| Vehicle | Description |
|---------|-------------|
| `van` | Full-size delivery van |
| `golf_cart` | Campus golf cart |

**Availability Check**: Only one active run per vehicle.

### Run Completion

Requirements for completion:
1. All orders in `Delivered` status
2. All orders have signatures (for local delivery)

On completion:
- Run status → `Completed`
- End time recorded
- Orders marked fulfilled in Inflow (best-effort)

---

## Shipping Workflow

### Overview

Structured workflow for orders requiring external shipping.

**Page**: `frontend/src/pages/Shipping.tsx`

### Shipping Stages

```
Work Area → At Dock → Shipped to Carrier → Delivered
```

| Stage | Description |
|-------|-------------|
| `work_area` | Initial stage, order ready for shipping prep |
| `dock` | Order physically prepared, awaiting carrier |
| `shipped` | Handed to carrier with tracking info |

### Stage Transitions

**Blocking Requirements**:
- Cannot skip stages (must progress sequentially)
- Cannot proceed to Shipped without being at Dock
- Carrier name required for Shipped transition
- Tracking number optional but recommended

### Shipping Data Model

```python
# Order shipping fields
shipping_workflow_status: Enum       # work_area, dock, shipped
shipping_workflow_status_updated_at: DateTime
shipping_workflow_status_updated_by: String
shipped_to_carrier_at: DateTime
shipped_to_carrier_by: String
carrier_name: String                 # FedEx, UPS, etc.
tracking_number: String              # Carrier tracking number
```

### Automatic Delivery

When order reaches `shipped` status, system automatically transitions to `Delivered`.

---

## PDF Generation

### Overview

ReportLab-based PDF generation for picklists and order details.

**Service**: `backend/app/services/pdf_service.py`

### Picklist Generation

**Endpoint**: `POST /api/orders/{order_id}/picklist`

**Contents**:
- Order header (PO number, customer info, shipping address)
- Item details (products, SKUs, quantities, serial numbers)
- Smart filtering (only unshipped items)
- Order remarks
- Signature line

**Storage**: `STORAGE_ROOT/picklists/{order_number}.pdf`

### Order Details PDF

**Endpoint**: `GET /api/orders/{order_id}/order-details.pdf`

**Contents**:
- TAMU Technology Services header with logo
- Barcode for order number
- Billing and shipping addresses
- Line items with prices
- Subtotals and totals
- Order remarks

**Features**:
- In-browser viewing
- Download option
- Email delivery to recipient

### PDF Email Delivery

**Endpoint**: `POST /api/orders/{order_id}/send-order-details`

Generates Order Details PDF and emails to recipient with:
- Professional HTML email template
- Plain text fallback
- PDF attachment

---

## Email Service

### Overview

Email sending via Microsoft Graph API using Service Principal authentication.

**Service**: `backend/app/services/email_service.py`

### Configuration

```env
SMTP_ENABLED=true                    # Enable/disable email sending
SMTP_FROM_ADDRESS=techhub@tamu.edu   # Sender address
EMAIL_FROM_NAME=TechHub              # Display name
```

**Required Graph Permissions**: `Mail.Send`

### Email Methods

#### General Email
```python
email_service.send_email(
    to_address="recipient@tamu.edu",
    subject="Subject Line",
    body_html="<p>HTML content</p>",
    body_text="Plain text fallback",
    attachment_name="document.pdf",
    attachment_content=pdf_bytes
)
```

#### Order Details Email
```python
email_service.send_order_details_email(
    to_address="recipient@tamu.edu",
    order_number="TH4013",
    customer_name="John Smith",
    pdf_content=pdf_bytes
)
```

---

## Teams Notification Service

### Overview

Teams notifications via SharePoint folder queue + Power Automate flow.

**Service**: `backend/app/services/teams_recipient_service.py`

### Architecture

```
Backend → SharePoint Queue Folder → Power Automate Flow → Teams Message
```

### Queue Strategy

1. Backend creates JSON notification file
2. Uploads to SharePoint queue folder
3. Power Automate monitors folder for new files
4. Flow reads JSON and sends Teams message
5. Flow deletes processed file

### Notification Payload

```json
{
  "id": "notif_TH4013_1737500000",
  "type": "delivery_notification",
  "recipientEmail": "recipient@tamu.edu",
  "recipientName": "John Smith",
  "orderNumber": "TH4013",
  "deliveryRunner": "Jane Doe",
  "estimatedTime": "Shortly",
  "createdAt": "2026-01-21T15:00:00"
}
```

### Configuration

```env
TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED=true
TEAMS_NOTIFICATION_QUEUE_FOLDER=notifications-queue
```

See [docs/Teams_PowerAutomate_Setup.md](docs/Teams_PowerAutomate_Setup.md) for Power Automate configuration.

---

## Document Signing

### Overview

In-app PDF signature capture for delivery confirmation.

**Page**: `frontend/src/pages/DocumentSigningPage.tsx`

### Features

- Load PDF documents from storage
- Stylus/touch signature input
- Overlay signature on PDF
- Save signed version
- Download signed document

### Process

1. Load picklist PDF for order
2. Recipient draws signature
3. Signature embedded in PDF
4. Signed document saved to storage
5. Order `signature_captured_at` updated

---

## Real-time Updates

### Overview

Socket.IO WebSocket integration for live delivery tracking.

**Backend**: Flask-SocketIO in `backend/app/main.py`
**Frontend**: `frontend/src/hooks/useDeliveryRuns.ts`

### Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | Client→Server | Client connects |
| `active_runs` | Server→Client | Broadcast active delivery runs |
| `disconnect` | Client→Server | Client disconnects |

### Message Format

```json
{
  "type": "active_runs",
  "data": [
    {
      "id": "uuid",
      "name": "Morning Run 1",
      "runner": "Jane Doe",
      "vehicle": "van",
      "status": "Active",
      "orders": [...]
    }
  ]
}
```

### Fallback

If WebSocket connection fails, frontend falls back to HTTP polling.

---

## Audit Logging

### Overview

Complete audit trail of all status changes and actions.

**Service**: `backend/app/services/audit_service.py`
**Model**: `backend/app/models/audit_log.py`

### Order Audit Log

```python
class AuditLog:
    id: String(36)           # UUID
    order_id: String(36)     # Foreign key to Order
    changed_by: String       # User who made change
    from_status: String      # Previous status
    to_status: String        # New status
    reason: Text             # Optional reason
    timestamp: DateTime      # When change occurred
    metadata: JSON           # Additional context
```

### System Audit Log

```python
class SystemAuditLog:
    id: String(36)
    entity_type: String      # 'order', 'delivery_run', 'webhook'
    entity_id: String
    action: String           # 'create', 'update', 'delete'
    description: Text
    user_id: String
    user_role: String
    old_value: JSON
    new_value: JSON
    metadata: JSON
    ip_address: String
    user_agent: Text
    timestamp: DateTime
```

### Viewing Audit Logs

**Endpoint**: `GET /api/orders/{order_id}/audit`

Audit logs displayed on order detail page with:
- Timestamp
- User attribution
- Status change details
- Reason (if provided)

---

## Authentication & Sessions

### SAML Authentication

**Service**: `backend/app/services/saml_auth_service.py`

Texas A&M SSO via SAML 2.0:

1. User clicks "Sign In"
2. Redirect to TAMU IdP
3. User authenticates
4. IdP POSTs assertion to `/auth/saml/callback`
5. Backend creates session
6. User redirected to application

**Configuration**:
```env
SAML_ENABLED=true
SAML_IDP_ENTITY_ID=<Microsoft Entra Identifier>
SAML_IDP_SSO_URL=<Login URL>
SAML_IDP_CERT_PATH=certs/saml_idp_cert.crt
SAML_SP_ENTITY_ID=https://your-domain
SAML_ACS_URL=https://your-domain/auth/saml/callback
```

### Session Management

**Model**: `backend/app/models/session.py`

```python
class Session:
    id: String(36)           # Session ID (cookie value)
    user_id: String(36)      # Foreign key to User
    created_at: DateTime
    expires_at: DateTime
    ip_address: String
    user_agent: Text
```

**Configuration**:
```env
SESSION_COOKIE_NAME=techhub_session
SESSION_MAX_AGE_HOURS=168
```

### User Model

```python
class User:
    id: String(36)           # UUID
    email: String            # UPN from SAML
    display_name: String     # From SAML assertion
    department: String       # Optional
    employee_id: String      # Optional
    created_at: DateTime
    last_login_at: DateTime
```

---

## SharePoint Storage

### Overview

Document storage via Microsoft Graph API.

**Service**: `backend/app/services/sharepoint_service.py`

### Configuration

```env
SHAREPOINT_ENABLED=true
SHAREPOINT_SITE_URL=https://tamucs.sharepoint.com/teams/Team-TechHub
SHAREPOINT_FOLDER_PATH=General/delivery-storage
```

**Required Graph Permissions**: `Sites.ReadWrite.All`

### Storage Structure

```
SharePoint Site/
└── Documents/
    └── General/
        └── delivery-storage/
            ├── picklists/
            │   └── TH4013.pdf
            ├── qa/
            │   └── TH4013_qa.json
            ├── signed/
            │   └── TH4013_signed.pdf
            └── notifications-queue/
                └── notification_TH4013_*.json
```

### Methods

```python
# Upload file
sharepoint_service.upload_file(content, subfolder, filename)

# Upload JSON
sharepoint_service.upload_json(data, subfolder, filename)

# Download file
content = sharepoint_service.download_file(subfolder, filename)

# Check existence
exists = sharepoint_service.file_exists(subfolder, filename)
```

---

## Admin Dashboard

### Overview

System administration and monitoring interface.

**Page**: `frontend/src/pages/Admin.tsx`

### System Status Cards

| Service | Status Check |
|---------|--------------|
| Database | Connection test |
| Inflow API | API connectivity |
| SharePoint | Graph API + site access |
| Email | Graph API configuration |
| Teams | Queue folder access |

### Webhook Management

- View registered webhooks
- Register new webhooks
- Delete webhooks
- View webhook status and failure counts

### Testing Tools

| Tool | Purpose |
|------|---------|
| Manual Sync | Trigger Inflow sync |
| Test SharePoint | Upload test file |
| Test Email | Send test email |
| Test Teams | Queue test notification |

### System Settings

- Feature toggles
- Environment configuration display
- Sync status and history

---

## API Reference

### Orders API (`/api/orders`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (filter by status, search) |
| GET | `/api/orders/{id}` | Get order details with audit logs |
| PATCH | `/api/orders/{id}` | Update order fields |
| PATCH | `/api/orders/{id}/status` | Transition order status |
| POST | `/api/orders/{id}/tag` | Record asset tagging |
| POST | `/api/orders/{id}/picklist` | Generate picklist PDF |
| GET | `/api/orders/{id}/picklist` | Download picklist |
| GET | `/api/orders/{id}/order-details.pdf` | Generate Order Details PDF |
| POST | `/api/orders/{id}/send-order-details` | Email Order Details |
| POST | `/api/orders/{id}/qa` | Submit QA checklist |
| POST | `/api/orders/{id}/fulfill` | Mark fulfilled in Inflow |
| POST | `/api/orders/bulk-transition` | Bulk status transition |
| GET | `/api/orders/{id}/audit` | Get audit logs |

### Inflow API (`/api/inflow`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/inflow/sync` | Trigger manual sync |
| GET | `/api/inflow/sync-status` | Get sync status |
| POST | `/api/inflow/webhook` | Webhook receiver |
| GET | `/api/inflow/webhooks` | List webhooks |
| POST | `/api/inflow/webhooks/register` | Register webhook |
| DELETE | `/api/inflow/webhooks/{id}` | Delete webhook |

### Delivery Runs API (`/api/delivery-runs`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/delivery-runs` | Create delivery run |
| GET | `/api/delivery-runs/active` | Get active runs |
| GET | `/api/delivery-runs/{id}` | Get run details |
| PUT | `/api/delivery-runs/{id}/finish` | Complete run |
| GET | `/api/delivery-runs/vehicles/available` | Vehicle availability |

### Auth API (`/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/me` | Get current user |
| GET | `/auth/saml/login` | Initiate SAML login |
| POST | `/auth/saml/callback` | SAML assertion consumer |
| POST | `/auth/logout` | Logout |
| GET | `/auth/sessions` | List user sessions |
| DELETE | `/auth/sessions/{id}` | Revoke session |

### System API (`/api/system`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/status` | System health status |
| GET | `/api/system/settings` | Get settings |
| POST | `/api/system/test-sharepoint` | Test SharePoint |
| POST | `/api/system/test-email` | Test email |
| POST | `/api/system/test-teams` | Test Teams notification |
| POST | `/api/system/deploy` | GitHub webhook deploy |

---

## Database Schema

### Orders Table

```sql
CREATE TABLE orders (
    id VARCHAR(36) PRIMARY KEY,
    inflow_order_id VARCHAR(255) UNIQUE NOT NULL,
    inflow_sales_order_id VARCHAR(255),
    recipient_name VARCHAR(255),
    recipient_contact VARCHAR(255),
    delivery_location VARCHAR(500),
    po_number VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'picked',
    assigned_deliverer VARCHAR(255),
    issue_reason TEXT,
    delivery_run_id VARCHAR(36),

    -- Prep steps
    tagged_at DATETIME,
    tagged_by VARCHAR(255),
    tag_data JSON,
    picklist_generated_at DATETIME,
    picklist_generated_by VARCHAR(255),
    picklist_path VARCHAR(500),
    qa_completed_at DATETIME,
    qa_completed_by VARCHAR(255),
    qa_data JSON,
    qa_path VARCHAR(500),
    qa_method VARCHAR(50),

    -- Signature
    signature_captured_at DATETIME,
    signed_picklist_path VARCHAR(500),

    -- Order details
    order_details_path VARCHAR(500),
    order_details_generated_at DATETIME,

    -- Shipping
    shipping_workflow_status VARCHAR(50) DEFAULT 'work_area',
    shipping_workflow_status_updated_at DATETIME,
    shipping_workflow_status_updated_by VARCHAR(255),
    shipped_to_carrier_at DATETIME,
    shipped_to_carrier_by VARCHAR(255),
    carrier_name VARCHAR(100),
    tracking_number VARCHAR(255),

    -- Inflow data
    inflow_data JSON,

    -- Timestamps
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    FOREIGN KEY (delivery_run_id) REFERENCES delivery_runs(id)
);

CREATE INDEX ix_orders_inflow_order_id ON orders(inflow_order_id);
CREATE INDEX ix_orders_status ON orders(status);
CREATE INDEX ix_orders_delivery_run_id ON orders(delivery_run_id);
```

### Delivery Runs Table

```sql
CREATE TABLE delivery_runs (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    runner VARCHAR(255) NOT NULL,
    vehicle VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    start_time DATETIME,
    end_time DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

### Users Table

```sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    department VARCHAR(255),
    employee_id VARCHAR(255),
    created_at DATETIME NOT NULL,
    last_login_at DATETIME
);
```

### Sessions Table

```sql
CREATE TABLE sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Audit Logs Table

```sql
CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    changed_by VARCHAR(255),
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    reason TEXT,
    timestamp DATETIME NOT NULL,
    metadata JSON,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX ix_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX ix_audit_logs_timestamp ON audit_logs(timestamp);
```

### Inflow Webhooks Table

```sql
CREATE TABLE inflow_webhooks (
    id VARCHAR(36) PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL UNIQUE,
    url VARCHAR(500) NOT NULL,
    events JSON NOT NULL,
    status ENUM('active', 'inactive', 'failed') NOT NULL DEFAULT 'active',
    last_received_at DATETIME,
    failure_count INTEGER NOT NULL DEFAULT 0,
    secret VARCHAR(255),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

---

## Configuration Reference

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `INFLOW_API_URL` | Inflow Cloud API base URL |
| `INFLOW_API_KEY` | Inflow API key |
| `INFLOW_COMPANY_ID` | Inflow company ID |
| `SECRET_KEY` | Flask secret key |

### Authentication

| Variable | Description |
|----------|-------------|
| `SAML_ENABLED` | Enable SAML authentication |
| `SAML_IDP_ENTITY_ID` | IdP entity ID |
| `SAML_IDP_SSO_URL` | IdP login URL |
| `SAML_IDP_CERT_PATH` | Path to IdP certificate |
| `SAML_SP_ENTITY_ID` | Service provider entity ID |
| `SAML_ACS_URL` | Assertion consumer service URL |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Service principal client ID |
| `AZURE_CLIENT_SECRET` | Service principal secret |

### Features

| Variable | Description |
|----------|-------------|
| `SHAREPOINT_ENABLED` | Enable SharePoint storage |
| `SHAREPOINT_SITE_URL` | SharePoint site URL |
| `SHAREPOINT_FOLDER_PATH` | Base folder path |
| `SMTP_ENABLED` | Enable email sending |
| `SMTP_FROM_ADDRESS` | Sender email address |
| `TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED` | Enable Teams notifications |
| `TEAMS_NOTIFICATION_QUEUE_FOLDER` | SharePoint queue folder |

### Sync Configuration

| Variable | Description |
|----------|-------------|
| `INFLOW_POLLING_SYNC_ENABLED` | Enable polling sync |
| `INFLOW_POLLING_SYNC_INTERVAL_MINUTES` | Sync interval |
| `INFLOW_WEBHOOK_ENABLED` | Enable webhook sync |
| `INFLOW_WEBHOOK_URL` | Webhook receiver URL |
| `INFLOW_WEBHOOK_EVENTS` | Events to subscribe |
| `INFLOW_WEBHOOK_AUTO_REGISTER` | Auto-register on startup |

### Deployment

| Variable | Description |
|----------|-------------|
| `FLASK_ENV` | Environment (development/production) |
| `FRONTEND_URL` | Frontend URL for CORS |
| `DEPLOY_WEBHOOK_ENABLED` | Enable GitHub deploy webhook |
| `DEPLOY_WEBHOOK_SECRET` | Webhook signature secret |

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Orders not syncing | Check Inflow API credentials and scheduler status |
| Building codes not showing | Verify ArcGIS service accessibility |
| Database connection errors | Verify DATABASE_URL in .env |
| WebSocket not connecting | Check CORS configuration |
| SAML login fails | Verify certificate path and IdP URLs |
| SharePoint upload fails | Check Graph API permissions and site URL |
| Email not sending | Verify Graph API configuration |

### Logs

Backend logs output to console. Check application logs for detailed error messages.

For PythonAnywhere:
```bash
cat /var/log/techhub.pythonanywhere.com.error.log
cat /var/log/techhub.pythonanywhere.com.server.log
```

### Database Management

Use the database manager script for maintenance:

```bash
cd backend
python scripts/database_manager.py

# Or direct commands:
python scripts/database_manager.py --stats
python scripts/database_manager.py --list --status PreDelivery
python scripts/database_manager.py --search TH4013
```

---

## Support

For issues or questions, contact the TechHub development team.
