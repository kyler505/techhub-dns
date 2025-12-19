# TechHub Delivery Workflow App

An internal web application for managing delivery orders from Inflow inventory system through a complete delivery pipeline with automated Teams notifications and intelligent location extraction.

## Overview

The TechHub Delivery Workflow App streamlines the order delivery process for Texas A&M University's TechHub. It automatically syncs "picked" orders from Inflow, manages their status through the delivery lifecycle, extracts building codes from addresses using ArcGIS services, and sends Teams notifications when orders go out for delivery.

### Key Capabilities

- **Automated Order Sync**: Syncs picked orders (inventoryStatus `started`) from Inflow API every 5 minutes
- **Smart Location Extraction**: Extracts building abbreviations (ACAD, ZACH, LAAH, etc.) from addresses using ArcGIS service
- **Order Remarks Parsing**: Automatically extracts alternative delivery locations from order remarks
- **Status Workflow Management**: Tracks orders through Pre-Delivery → In Delivery → Delivered
  - **Teams Integration**: Sends automated notifications when orders transition to "In Delivery"
  - **Audit Logging**: Complete audit trail of all status changes
  - **Bulk Operations**: Efficient bulk status transitions for Pre-Delivery queue
  - **Document Signing**: Sign and download delivery PDFs stored in `frontend/public/pdfs`

## Architecture

- **Backend**: FastAPI with PostgreSQL, APScheduler for periodic sync
- **Frontend**: React + Vite with TypeScript, TailwindCSS
- **Notifications**: Microsoft Teams webhook integration
- **External Services**: Inflow API, ArcGIS (AggieMap), Azure Key Vault

## Setup

### Prerequisites

Before setting up the project, ensure you have the following installed:

- **Python 3.9+** - Download from [python.org](https://www.python.org/downloads/)
- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **PostgreSQL 15+** - Download from [postgresql.org](https://www.postgresql.org/download/) or use Docker
- **Docker** (optional, for local PostgreSQL) - Download from [docker.com](https://www.docker.com/products/docker-desktop/)
- **Visual Studio Build Tools** (Windows only) - Required for building Python packages with C extensions (like `psycopg2-binary`)
  - Download from [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/)
  - Install "Desktop development with C++" workload
  - Or install the standalone [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)

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

5. Set up PostgreSQL:
   - **Option A: Use Docker Compose** (recommended for local development):
   ```bash
   # From the project root directory
   docker compose up -d postgres
   ```
   - **Option B: Use existing PostgreSQL instance**
     - Ensure PostgreSQL is running
     - Create a database for the application
     - Note the connection details (host, port, database name, username, password)

6. Create a `.env` file in the `backend` directory and configure it:
```bash
# Create .env file (you may need to create this manually)
# Add the following variables:
# DATABASE_URL=postgresql://username:password@localhost:5432/database_name
# INFLOW_API_URL=your_inflow_api_url
# INFLOW_API_KEY=your_inflow_api_key
# TEAMS_WEBHOOK_URL=your_teams_webhook_url (optional)
# AZURE_KEY_VAULT_URL=your_azure_key_vault_url (optional)
```

   Example `.env` file for Docker PostgreSQL:
   ```
   DATABASE_URL=postgresql://techhub:techhub_password@localhost:5433/techhub_delivery
   INFLOW_API_URL=https://your-inflow-api-url.com
   INFLOW_API_KEY=your-api-key-here
   ```

7. Run database migrations:
```bash
alembic upgrade head
```

8. Start the server:
```bash
uvicorn app.main:app --reload
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

### Webhook Setup (Local Development)

For local webhook testing, use LocalTunnel to expose your backend to the internet:

1. **Start your backend server** (if not already running):
   ```bash
   cd backend
   .venv\Scripts\Activate.ps1  # Windows PowerShell
   uvicorn app.main:app --reload
   ```

2. **Start LocalTunnel** (in a new terminal):
   ```bash
   # Windows PowerShell
   cd backend
   .\scripts\start-localtunnel.ps1

   # Or manually:
   npx localtunnel --port 8000 --subdomain techhub-delivery-test
   ```

3. **Update your `.env` file** with the LocalTunnel URL:
   ```env
   INFLOW_WEBHOOK_ENABLED=true
   INFLOW_WEBHOOK_URL=https://techhub-delivery-test.loca.lt/api/inflow/webhook
   INFLOW_WEBHOOK_EVENTS=orderCreated,orderUpdated
   # INFLOW_WEBHOOK_SECRET is optional; it is stored when the webhook is registered.
   ```

4. **Restart your backend** to load the new environment variables

5. **Register the webhook** via Admin UI (`http://localhost:5173/admin`) or script:
   - Admin UI: Click "Register Webhook" (URL/events are pre-filled)
   - Script (one-step reset):
     ```bash
     python scripts/manage_inflow_webhook.py reset --url https://techhub-delivery-test.loca.lt/api/inflow/webhook --events orderCreated,orderUpdated
     ```

**Note:** LocalTunnel URLs may change if you restart it. Update your `.env` and re-register the webhook if needed.

## Features

### Core Functionality
- **Order Status Workflow**: Pre-Delivery → In Delivery → Delivered (with Issue tracking)
- **Automated Sync**: Background scheduler syncs picked orders from Inflow every 5 minutes
- **Building Code Extraction**: Automatically extracts building abbreviations from addresses using ArcGIS service
- **Order Remarks Parsing**: Intelligently extracts alternative delivery locations from order remarks
- **Teams Notifications**: Automated notifications when orders transition to "In Delivery"
- **Audit Logging**: Complete audit trail of all status changes with user tracking
- **Bulk Operations**: Efficient bulk status transitions for Pre-Delivery queue management

### Pages & Views
- **Dashboard**: Overview of all orders with filtering and search
- **Pre-Delivery Queue**: Manage orders ready for delivery assignment
  - **In Delivery**: Track orders currently out for delivery
  - **Order Detail**: Detailed view with audit logs and notification history
  - **Admin**: Configure Teams webhook and manage system settings
  - **Document Signing**: Sign and download delivery PDFs

## Scripts

### Pattern Discovery Script

The pattern discovery script (`backend/scripts/analyze_order_patterns.py`) analyzes all historical orders from the Inflow API to automatically discover common patterns in order remarks that indicate alternative delivery locations.

**Purpose**: When orders have remarks like "deliver to LAAH 424" instead of the shipping address, this script finds these patterns and can automatically update the code to extract alternative locations.

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

**What it does**:

1. Fetches all orders from Inflow API (including fulfilled/historical orders)
2. Analyzes order remarks to find patterns like "deliver to", "location:", etc.
3. Generates a JSON report with:
   - Summary statistics
   - Discovered patterns with frequency counts
   - Suggested regex patterns
   - Example matches for each pattern
4. Optionally updates `order_service.py` with new patterns (preserving existing ones)

**Output**: The script generates a JSON report at `backend/scripts/pattern_analysis_report.json` (or custom path) containing all discovered patterns and statistics.
