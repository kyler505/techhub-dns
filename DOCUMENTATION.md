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
- FastAPI (Python web framework)
- PostgreSQL (Database)
- SQLAlchemy (ORM)
- Alembic (Database migrations)
- APScheduler (Background task scheduling)
- httpx (HTTP client for external APIs)

**Frontend:**
- React 18 (UI framework)
- TypeScript (Type safety)
- Vite (Build tool)
- React Router (Routing)
- TailwindCSS (Styling)
- Axios (HTTP client)

**External Services:**
- Inflow API (Order source)
- ArcGIS Service (Building data)
- Microsoft Teams (Notifications)
- Azure Key Vault (Optional: API key storage)

## Architecture

### System Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Frontend  │◄───────►│    Backend   │◄───────►│  PostgreSQL │
│  (React)    │  HTTP   │   (FastAPI)  │   SQL   │  (Database) │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
  ┌──────────┐         ┌──────────────┐      ┌─────────────┐
  │  Inflow  │         │    ArcGIS    │      │   Teams     │
  │   API    │         │   Service    │      │  Webhook    │
  └──────────┘         └──────────────┘      └─────────────┘
```

### Request Flow

1. **Order Sync**: APScheduler triggers sync every 5 minutes
2. **Inflow API**: Fetches picked orders from Inflow
3. **Order Processing**: Extracts locations, building codes, and processes data
4. **Database**: Stores orders with extracted information
5. **Status Changes**: User actions trigger status transitions
6. **Notifications**: Teams notifications sent on "In Delivery" transition
7. **Audit Logging**: All changes recorded in audit log

## System Components

### Backend Structure

```
backend/
├── app/
│   ├── api/
│   │   └── routes/
│   │       ├── orders.py      # Order CRUD and status management
│   │       ├── inflow.py      # Inflow sync endpoints
│   │       ├── teams.py        # Teams configuration
│   │       └── audit.py       # Audit log endpoints
│   ├── models/
│   │   ├── order.py           # Order model
│   │   ├── audit_log.py       # Audit log model
│   │   ├── teams_config.py    # Teams configuration model
│   │   └── teams_notification.py  # Notification tracking
│   ├── services/
│   │   ├── order_service.py   # Order business logic
│   │   ├── inflow_service.py  # Inflow API integration
│   │   └── teams_service.py   # Teams notification service
│   ├── utils/
│   │   └── building_mapper.py # Building code extraction (ArcGIS)
│   ├── schemas/
│   │   └── order.py           # Pydantic schemas
│   ├── database.py            # Database connection
│   ├── config.py              # Configuration management
│   ├── main.py                # FastAPI application
│   └── scheduler.py           # Background task scheduler
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
│   │   └── teams.ts          # Teams API calls
│   ├── components/
│   │   ├── OrderTable.tsx    # Order listing table
│   │   ├── OrderDetail.tsx   # Order detail view
│   │   ├── StatusBadge.tsx   # Status display component
│   │   ├── StatusTransition.tsx  # Status change dialog
│   │   └── Filters.tsx       # Filter controls
│   ├── pages/
│   │   ├── Dashboard.tsx     # Main dashboard
│   │   ├── PreDeliveryQueue.tsx  # Pre-delivery queue
│   │   ├── InDelivery.tsx    # In-delivery tracking
│   │   ├── OrderDetailPage.tsx   # Order detail page
│   │   └── Admin.tsx         # Admin configuration
│   ├── hooks/
│   │   ├── useOrders.ts      # Order data hook
│   │   └── useStatusTransition.ts  # Status transition hook
│   ├── types/
│   │   └── order.ts          # TypeScript type definitions
│   └── App.tsx               # Main application component
```

## Data Models

### Order Model

The core order model stores order information synced from Inflow:

```python
class Order:
    id: UUID                    # Primary key
    inflow_order_id: String     # Order number from Inflow (e.g., "TH3270")
    inflow_sales_order_id: String  # Inflow sales order UUID
    recipient_name: String      # Recipient name
    recipient_contact: String    # Email address
    delivery_location: String   # Building code or address (e.g., "ACAD", "LAAH 424")
    po_number: String          # PO number
    status: OrderStatus         # Current status (PreDelivery, InDelivery, Delivered, Issue)
    assigned_deliverer: String   # Person assigned for delivery
    issue_reason: Text          # Reason if status is Issue
    inflow_data: JSONB          # Full Inflow payload (for reference)
    created_at: DateTime
    updated_at: DateTime
```

### Order Status Workflow

```
PreDelivery → InDelivery → Delivered
     ↓            ↓
   Issue ←───────┘
```

- **PreDelivery**: Order is picked and ready for delivery assignment
- **InDelivery**: Order is out for delivery (triggers Teams notification)
- **Delivered**: Order has been successfully delivered (terminal state)
- **Issue**: Order has a problem (can return to PreDelivery after resolution)

### Audit Log Model

Tracks all status changes:

```python
class AuditLog:
    id: UUID
    order_id: UUID              # Foreign key to Order
    changed_by: String          # User who made the change
    from_status: String         # Previous status
    to_status: String           # New status
    reason: Text                # Optional reason for change
    timestamp: DateTime
```

### Teams Notification Model

Tracks Teams notification delivery:

```python
class TeamsNotification:
    id: UUID
    order_id: UUID              # Foreign key to Order
    teams_message_id: String    # Teams message ID
    sent_at: DateTime
    status: Enum                # pending, sent, failed
    error_message: Text
    retry_count: Integer
```

## API Endpoints

### Orders API (`/api/orders`)

- `GET /api/orders` - List orders with filtering and pagination
  - Query params: `status`, `search`, `skip`, `limit`
- `GET /api/orders/{order_id}` - Get order details with audit logs
- `PATCH /api/orders/{order_id}` - Update order fields
- `PATCH /api/orders/{order_id}/status` - Transition order status
- `POST /api/orders/bulk-transition` - Bulk status transition
- `GET /api/orders/{order_id}/audit` - Get audit logs for order
- `POST /api/orders/{order_id}/retry-notification` - Retry Teams notification

### Inflow API (`/api/inflow`)

- `POST /api/inflow/sync` - Manually trigger Inflow sync
- `GET /api/inflow/sync-status` - Get last sync status

### Teams API (`/api/teams`)

- `GET /api/teams/config` - Get Teams webhook configuration
- `PUT /api/teams/config` - Update Teams webhook URL
- `POST /api/teams/test` - Test Teams webhook connection

### Audit API (`/api/audit`)

- `GET /api/audit/orders/{order_id}` - Get audit logs for order

## Frontend Pages

### Dashboard (`/`)

Main overview page displaying all orders with:
- Status filter tabs (All, Pre-Delivery, In Delivery, Delivered, Issue)
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

### Admin Page (`/admin`)

System configuration:
- Teams webhook URL configuration
- Webhook connection testing
- System status information

### Document Signing (`/document-signing`)

Document signing tool:
- Select PDFs stored in `frontend/public/pdfs`
- Draw a signature directly on top of the PDF
- Download a flattened copy after signing

## Key Features

### 1. Automated Order Synchronization

**Scheduler**: APScheduler runs every 5 minutes to sync orders from Inflow.

**Process**:
1. Fetches orders with `inventoryStatus="started"` (picked orders)
2. For each order:
   - Extracts order remarks for alternative locations
   - Extracts building code from location or address using ArcGIS
   - Creates or updates order in database
   - Sets status to PreDelivery (orders are already picked)

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
- PreDelivery → InDelivery or Issue
- InDelivery → Delivered or Issue
- Issue → PreDelivery (after resolution)
- Delivered → (terminal, no transitions)

**Validation**: Enforced in `OrderService._is_valid_transition()`

### 5. Teams Notifications

**Trigger**: When order status changes to "In Delivery"

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

### 6. Audit Logging

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

**Purpose**: Source of order data

**Authentication**:
- API key from environment variable or Azure Key Vault
- Bearer token authentication

**Endpoints Used**:
- `GET /{company_id}/sales-orders` - Fetch orders
- Filters: `inventoryStatus="started"` (picked orders)

**Service**: `backend/app/services/inflow_service.py`

### Inflow Webhooks

**Purpose**: Receive real-time order updates from Inflow

**Configuration**:
```
INFLOW_WEBHOOK_ENABLED=true
INFLOW_WEBHOOK_URL=https://your-public-url/api/inflow/webhook
INFLOW_WEBHOOK_EVENTS=orderCreated,orderUpdated
# INFLOW_WEBHOOK_SECRET is optional; it is stored when the webhook is registered.
```

**Registration Options**:
- **Admin UI**: `http://localhost:5173/admin` → Inflow Webhook Configuration → Register Webhook
- **Script (one-step reset)**:
  ```
  python scripts/manage_inflow_webhook.py reset --url https://your-public-url/api/inflow/webhook --events orderCreated,orderUpdated
  ```

**Notes**:
- The webhook secret is generated by Inflow and returned only at creation time.
- The backend stores the secret in the database and uses it for signature verification.
- If the webhook URL changes (e.g., LocalTunnel), re-register the webhook.

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

## Database Schema

### Orders Table

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    inflow_order_id VARCHAR UNIQUE NOT NULL,
    inflow_sales_order_id VARCHAR,
    recipient_name VARCHAR,
    recipient_contact VARCHAR,
    delivery_location VARCHAR,
    po_number VARCHAR,
    status orderstatus NOT NULL DEFAULT 'PreDelivery',
    assigned_deliverer VARCHAR,
    issue_reason TEXT,
    inflow_data JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX ix_orders_inflow_order_id ON orders(inflow_order_id);
CREATE INDEX ix_orders_status ON orders(status);
```

### Audit Logs Table

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    changed_by VARCHAR,
    from_status VARCHAR,
    to_status VARCHAR NOT NULL,
    reason TEXT,
    timestamp TIMESTAMP NOT NULL
);
```

### Teams Config Table

```sql
CREATE TABLE teams_config (
    id UUID PRIMARY KEY,
    webhook_url VARCHAR,
    updated_at TIMESTAMP NOT NULL,
    updated_by VARCHAR
);
```

### Teams Notifications Table

```sql
CREATE TABLE teams_notifications (
    id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    teams_message_id VARCHAR,
    sent_at TIMESTAMP,
    status notificationstatus NOT NULL,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL
);
```

## Deployment

### Environment Variables

**Backend** (`.env` file in `backend` directory):
```
DATABASE_URL=postgresql://user:password@localhost:5432/techhub_delivery
# For Docker PostgreSQL (default):
# DATABASE_URL=postgresql://techhub:techhub_password@localhost:5433/techhub_delivery
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

1. **Database**: Use managed PostgreSQL service
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
- **PostgreSQL 15+** - Download from [postgresql.org](https://www.postgresql.org/download/) or use Docker
- **Docker** (optional, for local PostgreSQL) - Download from [docker.com](https://www.docker.com/products/docker-desktop/)
- **Visual Studio Build Tools** (Windows only) - Required for building Python packages with C extensions (like `psycopg2-binary`)
  - Download from [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/)
  - Install "Desktop development with C++" workload
  - Or install the standalone [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)

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

5. Set up PostgreSQL (using Docker Compose from project root):
```bash
# From the project root directory
docker compose up -d postgres
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

### Pattern Discovery Script

**Location**: `backend/scripts/analyze_order_patterns.py`

**Purpose**: Analyzes historical orders to discover patterns in order remarks for alternative delivery locations.

**Usage**:
```bash
cd backend

# Activate virtual environment first
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (Command Prompt):
.venv\Scripts\activate.bat
# Linux/Mac:
source .venv/bin/activate

# Preview analysis without saving (dry run)
python scripts/analyze_order_patterns.py --dry-run

# Generate report and save to file
python scripts/analyze_order_patterns.py

# Generate report with custom output path
python scripts/analyze_order_patterns.py --output reports/pattern_analysis.json

# Generate report and automatically update order_service.py with discovered patterns
python scripts/analyze_order_patterns.py --update-code

# Preview code changes before updating
python scripts/analyze_order_patterns.py --update-code --dry-run

# Use custom minimum frequency threshold (default: 5)
python scripts/analyze_order_patterns.py --min-frequency 10
```

**Output**: JSON report with discovered patterns, frequencies, and suggested regex patterns. The script generates a JSON report at `backend/scripts/pattern_analysis_report.json` (or custom path) containing all discovered patterns and statistics.

### Inflow Webhook Management Script

**Location**: `backend/scripts/manage_inflow_webhook.py`

**Purpose**: List, register, delete, or reset Inflow webhook subscriptions.

**Common Commands**:
```
python scripts/manage_inflow_webhook.py list
python scripts/manage_inflow_webhook.py list --local
python scripts/manage_inflow_webhook.py register --url https://your-public-url/api/inflow/webhook --events orderCreated,orderUpdated --cleanup-url
python scripts/manage_inflow_webhook.py delete --url https://your-public-url/api/inflow/webhook
python scripts/manage_inflow_webhook.py reset --url https://your-public-url/api/inflow/webhook --events orderCreated,orderUpdated
```

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
