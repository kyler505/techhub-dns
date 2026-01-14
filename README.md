# TechHub Delivery Workflow App

An internal web application for managing delivery orders from Inflow inventory system through a complete delivery pipeline with automated Teams notifications and intelligent location extraction.

## Overview

The TechHub Delivery Workflow App streamlines the order delivery process for Texas A&M University's TechHub. It automatically syncs "picked" orders from Inflow, manages their status through the delivery lifecycle, extracts building codes from addresses using ArcGIS services, and sends Teams notifications when orders go out for delivery.

### Key Capabilities

- **Unified Authentication**: Secure TAMU SSO (SAML) for users and Service Principal for backend operations
- **Automated Order Sync**: Syncs picked orders (inventoryStatus `started`) from Inflow API every 5 minutes
- **Real-time Webhook Integration**: Receives instant order updates via Inflow webhooks with fallback to polling
- **Smart Location Extraction**: Extracts building abbreviations (ACAD, ZACH, LAAH, etc.) from addresses using ArcGIS service
- **Dual Workflow Management**:
  - **Local Delivery**: Picked -> Pre-Delivery -> In Delivery -> Delivered (with delivery runs)
  - **Shipping**: Picked -> Pre-Delivery -> Shipping -> Delivered (with shipping workflow stages)
- **Delivery Run Management**: Group orders into delivery runs with vehicle assignment and runner tracking
- **Live Delivery Dashboard**: Real-time tracking of active delivery runs with Socket.IO updates
- **Prep Gating**: Asset tagging, picklist generation, and QA are required before Pre-Delivery
- **Teams Integration**: System-automated notifications via Microsoft Graph API
- **Audit Logging**: Complete audit trail of all status changes and delivery run actions
- **Admin Status Dashboard**: Real-time view of system health and feature configuration

## Architecture

- **Backend**: Flask with MySQL, MSAL (Graph API), python3-saml (SSO), APScheduler
- **Frontend**: React + Vite with TypeScript, TailwindCSS, Socket.IO client
- **Authentication**: TAMU Entra ID (SAML for users, Client Credentials for backend)
- **Services**: Microsoft Graph (Email, SharePoint, Teams), Inflow API, ArcGIS
- **Real-time**: Socket.IO for delivery tracking, Webhooks for order sync

## Setup

### Prerequisites

- **Python 3.12+**
- **Node.js 18+**
- **MySQL 8.0+**
- **Azure App Registrations** (See [docs/AUTHENTICATION_SETUP.md](docs/AUTHENTICATION_SETUP.md))

### Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment named `.venv`:
```bash
python -m venv .venv
```

3. Activate the virtual environment:
   - **Windows (PowerShell)**: `.venv\Scripts\Activate.ps1`
   - **Linux/Mac**: `source .venv/bin/activate`

4. Install dependencies (including MSAL and SAML):
```bash
pip install -r requirements.txt
```

5. Set up MySQL (Docker or Local):
   ```bash
   docker compose up -d mysql
   ```

6. Configure Environment:
   ```bash
   cp .env.example .env
   # Edit .env with your Database, Inflow, and Azure credentials
   ```
   > See `docs/AUTHENTICATION_SETUP.md` for obtaining Azure IDs and Certificates.

7. **SAML Certificate**:
   Place your downloaded `saml_idp_cert.crt` file in `backend/certs/`.

8. Run database migrations:
```bash
alembic upgrade head
```

7. Run database migrations:
```bash
alembic upgrade head
```

8. Start the server:
```bash
# Development
python -m app.main

# Production (with Waitress)
waitress-serve --listen=*:8000 app.main:app
```

The API will be available at `http://localhost:8000`

### Frontend

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Initial Configuration

1. Access the admin page at `http://localhost:5173/admin`
2. Configure the Teams webhook URL
3. Test the webhook connection
4. Manually trigger an Inflow sync from the API or wait for automatic sync (every 5 minutes)

   **Manual Sync Command (PowerShell)**:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:8000/api/inflow/sync" -Method POST -ContentType "application/json"
   ```

   **Manual Sync Command (curl)**:
   ```bash
   curl -X POST http://localhost:8000/api/inflow/sync -H "Content-Type: application/json"
   ```

   **Response**: Returns JSON with sync statistics (orders_synced, orders_created, orders_updated)

### Webhook Setup (Local Development)

For local webhook testing, use Cloudflare Tunnel (cloudflared) to expose your backend to the internet:

1. **Install Cloudflare Tunnel** (if not already installed):
   ```bash
   # Windows (using winget)
   winget install --id Cloudflare.cloudflared

   # macOS (using brew)
   brew install cloudflared

   # Linux
   # Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/
   ```

2. **Start your backend server** (if not already running):
   ```bash
   cd backend
   .venv\Scripts\Activate.ps1  # Windows PowerShell
   python -m app.main
   ```

3. **Start Cloudflare Tunnel** (in a new terminal):
   ```bash
   # Windows PowerShell
   cd backend
   .\scripts\start-cloudflared.ps1

   # Linux/macOS
   cd backend
   ./scripts/start-cloudflared.sh
   ```

4. **The script will automatically**:
   - Start the Cloudflare tunnel
   - Extract the generated URL
   - Register the webhook with Inflow
   - Display the tunnel and webhook URLs

5. **Test the webhook** by creating/updating an order in Inflow

**Note:** Cloudflare Tunnel URLs change each time you restart it. The script handles re-registration automatically.

### Inflow Webhook Setup (Alternative to Polling)

For production environments or when real-time updates are preferred, set up Inflow webhooks instead of relying solely on the 5-minute polling sync:

1. **Configure Environment Variables**:
   ```bash
   INFLOW_WEBHOOK_ENABLED=true
   INFLOW_WEBHOOK_URL=https://your-public-url/api/inflow/webhook
   INFLOW_WEBHOOK_EVENTS=orderCreated,orderUpdated
   ```

2. **Register Webhook** (using the management script):
   ```bash
   cd backend
   python scripts/manage_inflow_webhook.py reset --url https://your-public-url/api/inflow/webhook --events orderCreated,orderUpdated
   ```

3. **Webhook Management**:
   - **List webhooks**: `python scripts/manage_inflow_webhook.py list`
   - **Delete webhook**: `python scripts/manage_inflow_webhook.py delete --url https://your-url`
   - **Reset webhook**: `python scripts/manage_inflow_webhook.py reset --url https://your-url --events orderCreated,orderUpdated`

**Benefits**: Instant order updates, reduced API load, real-time notifications for urgent orders.

## Features

### Pages & Views
- **Delivery Dashboard**: Live overview with delivery runs, statistics, and real-time tracking
- **Orders Dashboard**: Overview of all orders with filtering and search
- **Pre-Delivery Queue**: Manage orders ready for delivery assignment
- **In Delivery**: Track orders currently out for delivery
- **Shipping**: Manage shipping workflow (Work Area → Dock → Shipped to Carrier)
- **Delivery Run Detail**: Detailed view of delivery runs with order tracking
- **Order Detail**: Detailed view with audit logs and notification history
- **Admin**: Configure Teams webhook, manage Inflow webhooks, and system settings
- **Document Signing**: Sign and download delivery PDFs

## Scripts

### Database Manager

**Location**: `backend/scripts/database_manager.py`

**Purpose**: Universal database and order management tool for development, testing, and maintenance.

**Interactive Mode**:
```bash
cd backend
python scripts/database_manager.py
```

**Direct Commands**:
```bash
# List and search orders
python scripts/database_manager.py --list
python scripts/database_manager.py --list --status PreDelivery
python scripts/database_manager.py --search TH3970

# Order details and management
python scripts/database_manager.py --details TH3970
python scripts/database_manager.py --update-status TH3970 Delivered
python scripts/database_manager.py --delete TH3970

# Create test orders
python scripts/database_manager.py --create --order-number TH9999 --recipient "Test User"

# Testing utilities
python scripts/database_manager.py --reset TH3970
python scripts/database_manager.py --clear-all
python scripts/database_manager.py --stats
```

**Features**:
- ✅ Create, read, update, delete orders
- ✅ Bulk operations and database maintenance
- ✅ Order status management with validation
- ✅ Testing utilities (reset orders, clear data)
- ✅ Comprehensive search and filtering
- ✅ Database statistics and health checks
- ✅ Interactive mode for complex operations

### Pattern Discovery Script

**Location**: `backend/scripts/analyze_order_patterns.py`

**Purpose**: Analyzes historical orders to discover patterns in order remarks for alternative delivery locations.

**Usage**:
```bash
cd backend
python scripts/analyze_order_patterns.py --dry-run    # Preview analysis
python scripts/analyze_order_patterns.py              # Generate report
python scripts/analyze_order_patterns.py --update-code # Update code with patterns
```

**Features**:
- Fetches historical orders from Inflow API
- Discovers location patterns in order remarks
- Generates JSON reports with statistics
- Optionally updates order parsing logic

### Inflow Webhook Management Script

**Location**: `backend/scripts/manage_inflow_webhook.py`

**Purpose**: Manage Inflow webhook subscriptions for real-time order updates.

**Common Commands**:
```bash
python scripts/manage_inflow_webhook.py list
python scripts/manage_inflow_webhook.py register --url https://your-app.com/api/inflow/webhook --events orderCreated,orderUpdated
python scripts/manage_inflow_webhook.py reset --url https://your-app.com/api/inflow/webhook --events orderCreated,orderUpdated
```

**Features**:
- List and manage webhook subscriptions
- Register/delete webhooks
- Automatic secret handling
- Failure tracking and recovery
