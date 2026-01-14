# TechHub Delivery Workflow - Detailed Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System Components](#system-components)
4. [Data Models](#data-models)
5. [API Endpoints](#api-endpoints)
6. [Frontend Pages](#frontend-pages)
7. [Key Features](#key-features)
8. [External Integrations](#external-integrations)
9. [Database Schema](#database-schema)
10. [Deployment](#deployment)
11. [Development](#development)
12. [Scripts](#scripts)
13. [Troubleshooting](#troubleshooting)
14. [Support](#support)

## Overview

The TechHub Delivery Workflow App is an internal web application designed to manage the complete lifecycle of delivery orders for Texas A&M University's TechHub. The system integrates with Inflow inventory management to automatically sync picked orders, manages their status through delivery workflows, and provides intelligent location extraction using ArcGIS services.

### Purpose

The application solves the challenge of managing delivery orders from the point they are "picked" in the Inflow system through final delivery. It provides:

- Automated synchronization of orders from Inflow
- Intelligent extraction of building codes from addresses
- Parsing of alternative delivery locations from order remarks
- Status workflow management with audit trails
- Automated Teams notifications for delivery personnel
- Bulk operations for efficient queue management

### Technology Stack

**Backend:**
- Flask (Python web framework)
- MySQL (Database)
- SQLAlchemy (ORM)
- Alembic (Database migrations)
- APScheduler (Background task scheduling)
- Flask-SocketIO (Real-time communications)
- **MSAL** (Microsoft Authentication Library for Graph API)
- **python3-saml** (SAML 2.0 User Authentication)
- httpx (HTTP client for external APIs)

**Frontend:**
- React 18 (UI framework)
- TypeScript (Type safety)
- Vite (Build tool)
- React Router (Routing)
- TailwindCSS (Styling)
- Socket.IO Client (Real-time updates)
- Axios (HTTP client)

**External Services:**
- Inflow API (Order source)
- ArcGIS Service (Building data)
- **Microsoft Entra ID** (Authentication & Authorization)
- **Microsoft Graph API** (Email, SharePoint, Teams)

## Architecture

### System Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Frontend  │◄───────►│    Backend   │◄───────►│    MySQL    │
│  (React)    │ HTTP/   │   (Flask)    │   SQL   │  (Database) │
│             │   WS    │              │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
       │                       │
       │ (SAML Redirect)       │ (Graph API)
       ▼                       ▼
┌──────────────┐        ┌──────────────┐      ┌─────────────┐
│  Microsoft   │        │   Microsoft  │◄────►│   Inflow    │
│   Entra ID   │        │     Graph    │      │  API/Webhk  │
└──────────────┘        └──────────────┘      └─────────────┘
```

### Request Flow

1. **Authentication**: User logs in via TAMU SSO (SAML). Backend verifies identity and establishes session.
2. **Order Sync**: APScheduler triggers sync every 5 minutes OR real-time webhook updates from Inflow.
3. **Inflow API/Webhooks**: Fetches picked orders from Inflow (polling) or receives instant updates (webhooks).
4. **Order Processing**: Extracts locations, building codes, determines delivery vs shipping workflow.
5. **Database**: Stores orders with extracted information and workflow classification.
6. **Delivery Run Creation**: Users create delivery runs, assign orders and vehicles.
7. **Status Changes**: User actions trigger status transitions (locked > pre-delivery > in-delivery).
8. **Real-time Updates**: Socket.IO broadcasts delivery run changes to connected clients.
9. **Notifications**: Backend (as Service Principal) sends Teams channel notifications via Graph API.
10. **Audit Logging**: All changes recorded in audit log.

## System Components

### Backend Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/         # Blueprints (orders, auth, system, etc.)
│   │   └── middleware/     # Auth middleware, error handlers
│   ├── models/             # SQLAlchemy models (User, Session, Order)
│   ├── services/           # Business logic
│   │   ├── saml_auth_service.py # SAML handling
│   │   ├── graph_service.py     # Microsoft Graph (Email/SharePoint)
│   │   ├── inflow_service.py    # Inventory sync
│   ├── utils/              # Helpers
└── ...
```│   ├── api/
│   │   └── routes/
│   │       ├── orders.py          # Order CRUD and status management
│   │       ├── inflow.py          # Inflow sync endpoints and webhooks
│   │       ├── teams.py           # Teams configuration
│   │       ├── delivery_runs.py   # Delivery run management
│   │       └── audit.py           # Audit log endpoints
│   ├── models/
│   │   ├── order.py               # Order model
│   │   ├── delivery_run.py        # Delivery run model
│   │   ├── audit_log.py           # Audit log model
│   │   ├── teams_config.py        # Teams configuration model
│   │   ├── teams_notification.py  # Notification tracking
│   │   └── inflow_webhook.py      # Webhook management
│   ├── services/
│   │   ├── order_service.py       # Order business logic
│   │   ├── delivery_run_service.py # Delivery run management
│   │   ├── inflow_service.py      # Inflow API integration
│   │   └── teams_service.py       # Teams notification service
│   ├── utils/
│   │   └── building_mapper.py     # Building code extraction (ArcGIS)
│   ├── schemas/
│   │   ├── order.py               # Pydantic schemas
│   │   └── delivery_run.py        # Delivery run schemas
│   ├── database.py                # Database connection
│   ├── config.py                  # Configuration management
│   ├── main.py                    # Flask application
│   └── scheduler.py               # Background task scheduler
├── scripts/
│   └── analyze_order_patterns.py  # Pattern discovery script
└── alembic/                   # Database migrations
```

### Frontend Structure

```
frontend/
├── src/
│   ├── api/                   # API client functions
│   │   ├── client.ts         # Axios configuration
│   │   ├── orders.ts         # Order API calls
│   │   ├── inflow.ts         # Inflow sync API
│   │   ├── teams.ts          # Teams API calls
│   │   └── deliveryRuns.ts   # Delivery run API calls
│   ├── components/
│   │   ├── OrderTable.tsx    # Order listing table
│   │   ├── OrderDetail.tsx   # Order detail view
│   │   ├── StatusBadge.tsx   # Status display component
│   │   ├── StatusTransition.tsx  # Status change dialog
│   │   ├── Filters.tsx       # Filter controls
│   │   └── LiveDeliveryDashboard.tsx # Real-time delivery tracking
│   ├── pages/
│   │   ├── DeliveryDashboard.tsx   # Live delivery overview
│   │   ├── Orders.tsx        # Main orders dashboard
│   │   ├── PreDeliveryQueue.tsx  # Pre-delivery queue
│   │   ├── InDelivery.tsx    # In-delivery tracking
│   │   ├── Shipping.tsx      # Shipping workflow management
│   │   ├── OrderDetailPage.tsx   # Order detail page
│   │   ├── DeliveryRunDetailPage.tsx # Delivery run detail
│   │   └── Admin.tsx         # Admin configuration
│   ├── hooks/
│   │   ├── useOrders.ts      # Order data hook
│   │   ├── useStatusTransition.ts  # Status transition hook
│   │   └── useDeliveryRuns.ts # Delivery runs hook with Socket.IO
│   ├── types/
│   │   ├── order.ts          # TypeScript type definitions
│   │   └── websocket.ts      # Socket.IO message types
│   └── App.tsx               # Main application component
```

## Data Models

### Order Model

The core order model stores order information synced from Inflow:

```python
class Order:
    id: String(36)              # Primary key (UUID stored as string)
    inflow_order_id: String     # Order number from Inflow (e.g., "TH3270")
    inflow_sales_order_id: String  # Inflow sales order UUID
    recipient_name: String      # Recipient name
    recipient_contact: String    # Email address
    delivery_location: String   # Building code or address (e.g., "ACAD", "LAAH 424")
    po_number: String          # PO number
    status: OrderStatus         # Current status (Picked, PreDelivery, InDelivery, Delivered, Issue)
    assigned_deliverer: String   # Person assigned for delivery
    issue_reason: Text          # Reason if status is Issue
    tagged_at: DateTime         # Asset tagging timestamp
    tagged_by: String           # Asset tagging technician
    tag_data: JSON              # Asset tag details
    picklist_generated_at: DateTime
    picklist_generated_by: String
    picklist_path: String
    qa_completed_at: DateTime
    qa_completed_by: String
    qa_data: JSON
    qa_path: String
    qa_method: String           # "Delivery" or "Shipping"
    signature_captured_at: DateTime
    signed_picklist_path: String
    inflow_data: JSON           # Full Inflow payload (for reference)
    created_at: DateTime
    updated_at: DateTime
```

### Order Status Workflow

```
Picked -> PreDelivery -> InDelivery -> Delivered
   \\-> Issue -> Picked/PreDelivery

Picked -> PreDelivery -> Shipping -> Delivered
   \\-> Issue -> Picked/PreDelivery
```

- **Picked**: Order pulled from Inflow, awaiting prep steps
- **PreDelivery**: Asset tagging, picklist, and QA completed
- **InDelivery**: Order is out for local delivery (triggers Teams notification)
- **Shipping**: Order is prepared for external shipping (no Teams notification)
- **Delivered**: Order has been successfully delivered/shipped (terminal state)
- **Issue**: Order has a problem (can return to Picked or PreDelivery after resolution)

The QA checklist determines whether an order follows the Delivery or Shipping workflow based on the selected method.

### Audit Log Model

Tracks all status changes:

```python
class AuditLog:
    id: String(36)              # Primary key (UUID stored as string)
    order_id: String(36)        # Foreign key to Order
    changed_by: String          # User who made the change
    from_status: String         # Previous status
    to_status: String           # New status
    reason: Text                # Optional reason for change
    timestamp: DateTime
```

### Picklist Generation

Picklists are automatically generated from inFlow order data when requested via the API. The system creates professional PDF documents containing:

- **Order Header**: PO number, customer information, shipping address, recipient details
- **Item Details**: Product names, SKUs, quantities, and serial numbers (if applicable)
- **Smart Filtering**: Only shows unshipped items by subtracting already shipped quantities from picked quantities
- **Order Remarks**: Any special instructions or notes from the order
- **Signature Line**: Space for customer signature upon delivery

Picklists are generated using the ReportLab PDF library and stored in `STORAGE_ROOT/picklists/` with filenames matching the order number (e.g., `TH3950.pdf`).

### Order Details PDF

Order Details PDFs can be generated and emailed to recipients. These documents match inFlow's Document Designer format and include:

- **Header**: Texas A&M Technology Services logo, TechHub address, barcode
- **Order Metadata**: Order number, PO #, date
- **Addresses**: Billing and shipping addresses
- **Line Items**: Product names, SKUs (italicized), serial numbers, quantities, unit prices, subtotals
- **Totals**: Subtotal and total amounts
- **Remarks**: Order notes

**Features**:
- Generated on-demand via API endpoint
- Can be viewed in-browser or downloaded
- Email integration for sending to recipients

**Services**: `backend/app/services/pdf_service.py`, `backend/app/services/email_service.py`

### Teams Notification Model

Tracks Teams notification delivery:

```python
class TeamsNotification:
    id: String(36)              # Primary key (UUID stored as string)
    order_id: String(36)        # Foreign key to Order
    teams_message_id: String    # Teams message ID
    sent_at: DateTime
    status: Enum                # pending, sent, failed
    notification_type: String  # ready, in_delivery
    error_message: Text
    retry_count: Integer
```

### Delivery Run Model

Manages delivery runs with vehicle and runner assignment:

```python
class DeliveryRun:
    id: String(36)              # Primary key (UUID stored as string)
    name: String                # Auto-generated run name (e.g., "Morning Run 1")
    runner: String              # Person assigned to the run
    vehicle: String             # van, golf_cart
    status: String              # Active, Completed, Cancelled
    start_time: DateTime        # When run was created/started
    end_time: DateTime          # When run was completed
    created_at: DateTime
    updated_at: DateTime
    orders: Relationship        # Orders assigned to this run
```

### Inflow Webhook Model

Tracks webhook subscriptions for real-time updates:

```python
class InflowWebhook:
    id: String(36)              # Primary key (UUID stored as string)
    webhook_id: String          # Inflow webhook subscription ID
    url: String                 # Webhook endpoint URL
    events: JSON                # Events to subscribe to
    status: Enum                # active, inactive, failed
    last_received_at: DateTime  # Last webhook received
    failure_count: Integer      # Consecutive failures
    secret: String              # Webhook signature secret
    created_at: DateTime
    updated_at: DateTime
```

## API Endpoints

### Orders API (`/api/orders`)

- `GET /api/orders` - List orders with filtering and pagination
  - Query params: `status`, `search`, `skip`, `limit`
- `GET /api/orders/{order_id}` - Get order details with audit logs
- `PATCH /api/orders/{order_id}` - Update order fields
- `PATCH /api/orders/{order_id}/status` - Transition order status
- `POST /api/orders/{order_id}/tag` - Record asset tagging (mock)
- `POST /api/orders/{order_id}/picklist` - Generate picklist PDF from inFlow order data
- `GET /api/orders/{order_id}/picklist` - Download generated picklist PDF
- `GET /api/orders/{order_id}/order-details.pdf` - Generate and download Order Details PDF
- `POST /api/orders/{order_id}/send-order-details` - Generate Order Details PDF and email to recipient
- `POST /api/orders/{order_id}/qa` - Submit QA checklist responses
- `POST /api/orders/{order_id}/fulfill` - Mark order fulfilled in Inflow (best-effort)
- `POST /api/orders/bulk-transition` - Bulk status transition
- `GET /api/orders/{order_id}/audit` - Get audit logs for order
- `POST /api/orders/{order_id}/retry-notification` - Retry Teams notification

### Inflow API (`/api/inflow`)

- `POST /api/inflow/sync` - Manually trigger Inflow sync
- `GET /api/inflow/sync-status` - Get last sync status

#### Manual Order Sync

**Purpose**: Manually trigger the Inflow order synchronization process (same as the automatic 5-minute sync).

**Command (PowerShell)**:
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/inflow/sync" -Method POST -ContentType "application/json"
```

**Command (curl)**:
```bash
curl -X POST http://localhost:8000/api/inflow/sync -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "orders_synced": 25,
  "orders_created": 5,
  "orders_updated": 20,
  "message": "Synced 25 orders"
}
```

**Process**:
1. Fetches recent "started" orders from Inflow API (up to 3 pages, 100 orders per page, targeting 100 total matches)
2. Creates or updates orders in the local database
3. Returns summary statistics of the sync operation

**Use Cases**:
- Testing Inflow integration
- Forcing immediate sync outside the 5-minute schedule
- Troubleshooting sync issues
- Initial data population after setup

### Teams API (`/api/teams`)

- `GET /api/teams/config` - Get Teams webhook configuration
- `PUT /api/teams/config` - Update Teams webhook URL
- `POST /api/teams/test` - Test Teams webhook connection

### Delivery Runs API (`/api/delivery-runs`)

- `POST /api/delivery-runs` - Create a new delivery run with assigned orders and vehicle
- `GET /api/delivery-runs/active` - Get all active delivery runs with order details
- `GET /api/delivery-runs/{run_id}` - Get detailed information about a specific delivery run
- `PUT /api/delivery-runs/{run_id}/finish` - Complete a delivery run (requires all orders delivered)
- `GET /api/delivery-runs/vehicles/available` - Get availability status of all vehicles
- `WebSocket /api/delivery-runs/ws` - Real-time updates for delivery run changes

### Audit API (`/api/audit`)

- `GET /api/audit/orders/{order_id}` - Get audit logs for order

## Frontend Pages

### Delivery Dashboard (`/`)

Main delivery operations dashboard:
- Live delivery run tracking with real-time WebSocket updates
- Pre-delivery, in-delivery, and shipping queues in tabs
- Delivery statistics (ready for delivery, active deliveries, completed today)
- Quick access to delivery run creation and management

### Orders Dashboard (`/orders`)

Main overview page displaying all orders with:
- Status filter tabs (All, Picked, Pre-Delivery, In Delivery, Delivered, Issue)
- Search functionality (order ID, recipient, location, PO number)
- Order table with key information
- Quick status transitions
- Link to order detail pages

### Pre-Delivery Queue (`/pre-delivery`)

Dedicated page for managing orders ready for delivery:
- Lists all Pre-Delivery status orders
- Bulk selection and status transition
- Assign deliverer functionality
- Filter and search capabilities

### In Delivery (`/in-delivery`)

Tracking page for orders currently out for delivery:
- Lists all In Delivery status orders
- Shows assigned deliverer
- Quick transition to Delivered or Issue
- Link to Teams notification status

### Order Detail Page (`/orders/:orderId`)

Detailed view of a single order:
- Complete order information
- Status transition interface
- Audit log history
- Teams notification status and retry
- Full Inflow data (if available)

### Delivery Run Detail Page (`/delivery/runs/:runId`)

Detailed view of a specific delivery run:
- Run information (runner, vehicle, status, timing)
- List of assigned orders with current status
- Order transition capabilities
- Run completion functionality

### Shipping Operations (`/shipping`)

Dedicated page for managing shipping workflow:
- Orders in shipping workflow stages (Work Area, Dock, Shipped to Carrier)
- Stage transitions with carrier and tracking information
- Shipping coordinator tools

### Admin Page (`/admin`)

System configuration:
- Teams webhook URL configuration
- Inflow webhook management and registration
- Webhook connection testing
- System status information

### Document Signing (`/document-signing`)

Document signing tool:
- Select PDFs stored in `frontend/public/pdfs`
- Draw a signature directly on top of the PDF
- Download a flattened copy after signing

### Local Storage

Picklists (generated from inFlow order data) and QA responses are stored on disk under `STORAGE_ROOT` (defaults to `storage`). QA submissions are written as JSON files in `storage/qa`.

## Key Features

### 1. Automated Order Synchronization

**Scheduler**: APScheduler runs every 5 minutes to sync orders from Inflow.

**Process**:
1. Fetches orders with `inventoryStatus="started"` (picked orders)
2. For each order:
   - Extracts order remarks for alternative locations
   - Extracts building code from location or address using ArcGIS
   - Creates or updates order in database
   - Sets status to Picked (orders are already picked in Inflow)

**Service**: `backend/app/services/inflow_service.py`
**Scheduler**: `backend/app/scheduler.py`

### 2. Building Code Extraction

**ArcGIS Integration**: Uses AggieMap's ArcGIS service to map addresses to building codes.

**Process**:
1. First checks if location string contains building code (e.g., "LAAH 424" → "LAAH")
2. If not found, queries ArcGIS service with address
3. Matches address against building data
4. Returns building abbreviation (e.g., "ACAD", "ZACH")
5. Falls back to original address if no match

**Caching**: Building data cached for 1 day to reduce API calls.

**Service**: `backend/app/utils/building_mapper.py`

### 3. Order Remarks Parsing

**Pattern Matching**: Extracts alternative delivery locations from order remarks.

**Patterns**:
- "deliver to [location]"
- "delivery to [location]"
- "deliver at [location]"
- "located at [location]"
- And more (auto-discovered via pattern analysis script)

**Example**:
- Remarks: "deliver to LAAH 424"
- Extracted: "LAAH 424"
- Building code: "LAAH"

**Service**: `backend/app/services/order_service.py::_extract_delivery_location_from_remarks()`

### 4. Status Transition Validation

**Rules**:
- Picked -> PreDelivery or Issue
- PreDelivery -> InDelivery (local delivery) or Shipping (external shipping) or Issue
- InDelivery -> Delivered or Issue
- Shipping -> Delivered or Issue
- Issue -> Picked or PreDelivery (after resolution)
- Delivered -> (terminal, no transitions)

**QA Integration**: The QA checklist determines whether PreDelivery transitions to InDelivery or Shipping based on the selected delivery method.

**Validation**: Enforced in `OrderService._is_valid_transition()`

### 5. QA Checklist Integration

**Purpose**: Comprehensive QA checklist that validates order preparation and determines workflow routing.

**Process**:
1. QA form checks asset tagging, packaging, documentation, and labeling
2. Technician selects delivery method: "Delivery" (local) or "Shipping" (external)
3. Based on method selection:
   - **Delivery**: Order transitions to PreDelivery → InDelivery → Delivered
   - **Shipping**: Order transitions to PreDelivery → Shipping → Delivered
4. Teams notifications only sent for local delivery orders

**Form Fields**:
- Order verification
- Asset tag and serial matching
- Template notifications sent
- Proper packaging verification
- Packing slip accuracy
- Electronic documentation
- Box labeling verification
- QA signature
- **Delivery method selection** (determines workflow path)

**Integration**: QA data is stored in the database and workflow automatically routes based on method selection.

**Filtering**: QA page defaults to showing only "Picked" status orders that haven't completed QA, with toggle to view all eligible orders.

### 6. Delivery Run Management

**Purpose**: Coordinate and track local deliveries by grouping orders into delivery runs with vehicle and runner assignment.

**Process**:
1. **Run Creation**: Select multiple Pre-Delivery orders and assign to a runner with vehicle
2. **Automatic Naming**: Runs are auto-named based on time (e.g., "Morning Run 1", "Afternoon Run 2")
3. **Order Assignment**: Orders transition to "In Delivery" status when run is created
4. **Live Tracking**: Real-time WebSocket updates show run status to all connected clients
5. **Run Completion**: Mark run complete only when all orders are delivered, triggers Inflow fulfillment

**Key Features**:
- Vehicle availability checking (no double-booking)
- Runner accountability and audit trails
- Real-time dashboard updates
- Bulk order transitions
- Automatic Teams notifications when runs start

**Service**: `backend/app/services/delivery_run_service.py`
**API**: `/api/delivery-runs/`
**Frontend**: Live delivery dashboard with WebSocket integration

### 7. Shipping Workflow Management

**Purpose**: Handle orders requiring external shipping with structured workflow stages and carrier tracking.

**Workflow Stages**:
1. **Work Area** (initial): Order ready for shipping preparation
2. **At Dock**: Order physically prepared and ready for carrier pickup
3. **Shipped to Carrier**: Order handed to carrier with tracking information

**Process**:
1. **Automatic Classification**: Orders classified as shipping based on delivery address (outside Bryan/College Station)
2. **QA Selection**: During QA, technician selects "Shipping" method
3. **Stage Transitions**: Manual progression through Work Area → Dock → Shipped to Carrier
4. **Carrier Integration**: Capture carrier name and tracking number
5. **Final Delivery**: Order marked delivered when shipping is confirmed

**Key Features**:
- Blocking stage progression (must complete each stage in order)
- Carrier and tracking number capture
- Audit trail for all shipping transitions
- Separate from local delivery workflow
- No Teams notifications (external shipping)

**Database Fields**: `shipping_workflow_status`, `carrier_name`, `tracking_number`, `shipped_to_carrier_at`

### 8. Teams Notifications

**Trigger**: When order status changes to "PreDelivery" (ready) or "In Delivery"

**Content**:
- Order ID
- Recipient name
- Delivery location (building code)
- Assigned deliverer
- Status

**Delivery**: Sent via background task to avoid blocking
**Tracking**: All notifications logged with status (sent/failed)
**Retry**: Failed notifications can be retried manually

**Service**: `backend/app/services/teams_service.py`

### 9. Audit Logging

**Automatic**: All status changes automatically logged

**Information Captured**:
- Order ID
- User who made change (if provided)
- Previous status
- New status
- Reason (if provided)
- Timestamp

**Access**: Available via API and order detail page

## External Integrations

### Inflow API

**Purpose**: Source of order data with polling and webhook support

**Authentication**:
- API key from environment variable or Azure Key Vault
- Bearer token authentication

**Endpoints Used**:
- `GET /{company_id}/sales-orders` - Fetch orders (polling)
- Filters: `inventoryStatus="started"` (picked orders)
- `PUT /{company_id}/sales-orders` - Update orders for fulfillment (pick/pack/ship lines)
- `POST /webhooks` - Register webhook subscriptions
- `GET /webhooks` - List webhook subscriptions
- `DELETE /webhooks/{id}` - Delete webhook subscriptions

**Service**: `backend/app/services/inflow_service.py`

### Inflow Webhooks

**Purpose**: Real-time order updates with fallback to polling

**Configuration**:
```
INFLOW_WEBHOOK_ENABLED=true
INFLOW_WEBHOOK_URL=https://your-public-url/api/inflow/webhook
INFLOW_WEBHOOK_EVENTS=orderCreated,orderUpdated
```

**Features**:
- Automatic webhook registration via management script
- Signature verification for security
- Fallback to 5-minute polling if webhooks fail
- Local database tracking of webhook subscriptions
- Failure counting and automatic deactivation

**Management Script**: `backend/scripts/manage_inflow_webhook.py`

**Webhook Endpoint**: `POST /api/inflow/webhook` - Receives real-time order updates

### ArcGIS Service (AggieMap)

**Purpose**: Building code mapping

**Endpoint**:
```
https://gis.cstx.gov/csgis/rest/services/IT_GIS/ITS_TAMU_Parking/MapServer/3/query
```

**Usage**:
- Queries all building data
- Matches addresses to building attributes
- Returns building codes

**Caching**: 1 day cache duration

**Service**: `backend/app/utils/building_mapper.py`

### Microsoft Teams

**Purpose**: Delivery notifications

**Configuration**: Webhook URL stored in database

**Message Format**: Adaptive Card with order details

**Service**: `backend/app/services/teams_service.py`

### Azure Key Vault (Optional)

**Purpose**: Secure API key storage

**Usage**: If `AZURE_KEY_Vault_URL` is set, retrieves Inflow API key from Key Vault

**Fallback**: Uses `INFLOW_API_KEY` environment variable

### Socket.IO Integration

**Purpose**: Real-time updates for delivery run tracking and live dashboard

**Implementation**:
- Flask-SocketIO server integrated with Flask app
- Broadcasts active delivery runs to all connected clients
- Socket.IO client with automatic reconnection
- Message format: `{"type": "active_runs", "data": [...run objects...]}`

**Frontend Integration**:
- `useDeliveryRuns` hook manages Socket.IO connection
- Automatic fallback to HTTP polling if Socket.IO fails
- Real-time updates without page refresh
- Connection status indicators

**Backend Features**:
- Global Socket.IO event emission
- Database session management per event
- Best-effort broadcasting (non-blocking)
- threading.Thread for background broadcasts

## Database Schema

> **Note:** The database uses MySQL 8.0+. UUIDs are stored as VARCHAR(36) strings.

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
    signature_captured_at DATETIME,
    signed_picklist_path VARCHAR(500),
    order_details_path VARCHAR(500),
    order_details_generated_at DATETIME,
    shipping_workflow_status VARCHAR(50) DEFAULT 'work_area',
    shipping_workflow_status_updated_at DATETIME,
    shipping_workflow_status_updated_by VARCHAR(255),
    shipped_to_carrier_at DATETIME,
    shipped_to_carrier_by VARCHAR(255),
    carrier_name VARCHAR(100),
    tracking_number VARCHAR(255),
    inflow_data JSON,
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

-- Vehicle values: 'van', 'golf_cart'
-- Status values: 'Active', 'Completed', 'Cancelled'
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

CREATE INDEX ix_inflow_webhooks_status ON inflow_webhooks(status);
CREATE INDEX ix_inflow_webhooks_webhook_id ON inflow_webhooks(webhook_id);
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

### System Audit Logs Table

```sql
CREATE TABLE system_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    user_id VARCHAR(255),
    user_role VARCHAR(100),
    old_value JSON,
    new_value JSON,
    metadata JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp DATETIME NOT NULL,
    created_at DATETIME NOT NULL
);

CREATE INDEX ix_system_audit_logs_entity_type ON system_audit_logs(entity_type);
CREATE INDEX ix_system_audit_logs_entity_id ON system_audit_logs(entity_id);
CREATE INDEX ix_system_audit_logs_timestamp ON system_audit_logs(timestamp);
```

### Teams Config Table

```sql
CREATE TABLE teams_config (
    id VARCHAR(36) PRIMARY KEY,
    webhook_url VARCHAR(500),
    updated_at DATETIME NOT NULL,
    updated_by VARCHAR(255)
);
```

### Teams Notifications Table

```sql
CREATE TABLE teams_notifications (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    teams_message_id VARCHAR(255),
    sent_at DATETIME,
    status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    notification_type VARCHAR(50) NOT NULL DEFAULT 'in_delivery',
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    webhook_url VARCHAR(500),
    created_at DATETIME NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX ix_teams_notifications_order_id ON teams_notifications(order_id);
CREATE INDEX ix_teams_notifications_teams_message_id ON teams_notifications(teams_message_id);
CREATE INDEX ix_teams_notifications_status ON teams_notifications(status);
CREATE INDEX ix_teams_notifications_notification_type ON teams_notifications(notification_type);
```


## Deployment

### Environment Variables

**Backend** (`.env` file in `backend` directory):
```
DATABASE_URL=mysql+pymysql://user:password@localhost:3306/techhub_delivery
# For Docker MySQL (default):
# DATABASE_URL=mysql+pymysql://techhub:techhub_password@localhost:3306/techhub_delivery
INFLOW_API_URL=https://your-inflow-api-url.com
INFLOW_API_KEY=your_api_key_here
INFLOW_WEBHOOK_ENABLED=true
INFLOW_WEBHOOK_URL=https://your-public-url/api/inflow/webhook
INFLOW_WEBHOOK_EVENTS=orderCreated,orderUpdated
# OR
AZURE_KEY_VAULT_URL=https://your-keyvault.vault.azure.net/
FRONTEND_URL=http://localhost:5173
SECRET_KEY=your-secret-key-here
TEAMS_WEBHOOK_URL=your_teams_webhook_url (optional)
STORAGE_ROOT=storage
```

### Database Migrations

Run migrations before starting:
```bash
cd backend

# Activate virtual environment first
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (Command Prompt):
.venv\Scripts\activate.bat
# Linux/Mac:
source .venv/bin/activate

# Run migrations
alembic upgrade head
```

### Production Considerations

1. **Database**: Use managed MySQL service
2. **API Keys**: Store in Azure Key Vault or secure secret management
3. **CORS**: Update `FRONTEND_URL` to production domain
4. **HTTPS**: Use reverse proxy (nginx) with SSL certificates
5. **Logging**: Configure proper logging levels and outputs
6. **Monitoring**: Set up health checks and monitoring
7. **Backups**: Regular database backups

## Development

### Prerequisites

Before setting up the development environment, ensure you have the following installed:

- **Python 3.9+** - Download from [python.org](https://www.python.org/downloads/)
- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **MySQL 8.0+** - Download from [mysql.com](https://dev.mysql.com/downloads/mysql/) or use Docker
- **Docker** (optional, for local MySQL) - Download from [docker.com](https://www.docker.com/products/docker-desktop/)
- Note: No additional Visual Studio Build Tools required for MySQL driver (pymysql is pure Python)

### Running Locally

**Backend Setup**:

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment named `.venv`:
```bash
python -m venv .venv
```

3. Activate the virtual environment:
   - **Windows (PowerShell)**:
   ```powershell
   .venv\Scripts\Activate.ps1
   ```
   - **Windows (Command Prompt)**:
   ```cmd
   .venv\Scripts\activate.bat
   ```
   - **Linux/Mac**:
   ```bash
   source .venv/bin/activate
   ```

4. Install dependencies:
```bash
pip install -r requirements.txt
```

5. Set up MySQL (using Docker Compose from project root):
```bash
# From the project root directory
docker compose up -d mysql
```

6. Create a `.env` file in the `backend` directory with your configuration (see Deployment section for details)

7. Run database migrations:
```bash
alembic upgrade head
```

8. Start the server:
```bash
uvicorn app.main:app --reload
```

**Frontend Setup**:

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

### Testing

**Backend**: Add tests in `backend/tests/`
**Frontend**: Add tests using Jest/Vitest

### Code Style

**Backend**: Follow PEP 8, use type hints
**Frontend**: Follow ESLint rules, use TypeScript strictly

### Adding New Features

1. **Database Changes**: Create Alembic migration
2. **API Changes**: Add route in `backend/app/api/routes/`
3. **Business Logic**: Add service method in `backend/app/services/`
4. **Frontend**: Add component/page in `frontend/src/`

## Scripts

### Database Manager

**Location**: `backend/scripts/database_manager.py`

**Purpose**: Comprehensive database and order management tool for development, testing, and maintenance operations.

**Interactive Mode**:
```bash
cd backend
python scripts/database_manager.py
```

**Command Line Usage**:
```bash
# Listing and searching
python scripts/database_manager.py --list
python scripts/database_manager.py --list --status PreDelivery
python scripts/database_manager.py --search TH3970
python scripts/database_manager.py --details TH3970

# Order management
python scripts/database_manager.py --delete TH3970
python scripts/database_manager.py --update-status TH3970 Delivered
python scripts/database_manager.py --create --order-number TH9999 --recipient "Test User"

# Testing and maintenance
python scripts/database_manager.py --reset TH3970
python scripts/database_manager.py --clear-all
python scripts/database_manager.py --stats
```

**Capabilities**:
- **Order CRUD**: Create, read, update, delete orders with full validation
- **Bulk Operations**: Efficient bulk status transitions and data management
- **Search & Filter**: Advanced filtering by status, order number, date ranges
- **Testing Utilities**: Reset orders to specific states for testing workflows
- **Database Maintenance**: Clear data, view statistics, health checks
- **Interactive Mode**: User-friendly menu system for complex operations
- **Safety Features**: Confirmation prompts and transaction safety

### Pattern Discovery Script

**Location**: `backend/scripts/analyze_order_patterns.py`

**Purpose**: Analyzes historical orders from Inflow API to discover patterns in order remarks that indicate alternative delivery locations.

**Usage**:
```bash
cd backend
python scripts/analyze_order_patterns.py --dry-run              # Preview analysis
python scripts/analyze_order_patterns.py                        # Generate report
python scripts/analyze_order_patterns.py --update-code          # Update code with patterns
python scripts/analyze_order_patterns.py --min-frequency 10     # Custom frequency threshold
```

**Process**:
1. Fetches all orders from Inflow API (including fulfilled/historical orders)
2. Analyzes order remarks to find patterns like "deliver to", "location:", etc.
3. Generates JSON report with statistics, patterns, and examples
4. Optionally updates `order_service.py` with discovered patterns

**Output**: JSON report file containing discovered patterns, frequencies, and suggested regex patterns.

### Inflow Webhook Management Script

**Location**: `backend/scripts/manage_inflow_webhook.py`

**Purpose**: Comprehensive webhook subscription management for real-time Inflow order updates.

**Usage**:
```bash
cd backend
python scripts/manage_inflow_webhook.py list                    # List remote webhooks
python scripts/manage_inflow_webhook.py list --local           # List local webhooks
python scripts/manage_inflow_webhook.py register --url https://your-app.com/api/inflow/webhook --events orderCreated,orderUpdated
python scripts/manage_inflow_webhook.py delete --url https://your-app.com/api/inflow/webhook
python scripts/manage_inflow_webhook.py reset --url https://your-app.com/api/inflow/webhook --events orderCreated,orderUpdated
```

**Features**:
- **Remote Management**: Register, list, and delete webhooks with Inflow API
- **Local Synchronization**: Track webhook state in local database
- **Security**: Automatic secret handling and signature verification
- **Monitoring**: Failure tracking and automatic status updates
- **Batch Operations**: Cleanup and reset operations for webhook management

**Supported Events**: `orderCreated`, `orderUpdated` (configurable)

### Legacy Picklist Generator

**Location**: `legacy scripts/pick_list_generator.py`

**Purpose**: Legacy GUI application for generating picklists from inFlow data. This was the original system used before the web application was developed.

**Features**:
- GUI interface for selecting orders by PO number
- Direct integration with inFlow API
- PDF generation with ReportLab
- Google Drive upload functionality
- Automatic browser opening for order verification

**Note**: The modern web application (`POST /api/orders/{order_id}/picklist`) provides the same functionality through a REST API with improved integration and audit trails. The legacy script remains for reference and potential migration purposes.

## Troubleshooting

### Common Issues

1. **Orders not syncing**: Check Inflow API credentials and scheduler status
2. **Building codes not showing**: Verify ArcGIS service is accessible
3. **Teams notifications failing**: Check webhook URL configuration
4. **Database connection errors**: Verify DATABASE_URL in .env

### Logs

Backend logs are output to console. Check application logs for detailed error messages.

## Support

For issues or questions, contact the development team or refer to the codebase documentation.
