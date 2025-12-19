# TechHub Delivery Workflow App

An internal web application for managing delivery orders from Inflow inventory system through a complete delivery pipeline with automated Teams notifications and intelligent location extraction.

## Overview

The TechHub Delivery Workflow App streamlines the order delivery process for Texas A&M University's TechHub. It automatically syncs "picked" orders from Inflow, manages their status through the delivery lifecycle, extracts building codes from addresses using ArcGIS services, and sends Teams notifications when orders go out for delivery.

### Key Capabilities

- **Automated Order Sync**: Syncs picked orders (inventoryStatus `started`) from Inflow API every 5 minutes
- **Smart Location Extraction**: Extracts building abbreviations (ACAD, ZACH, LAAH, etc.) from addresses using ArcGIS service
- **Order Remarks Parsing**: Automatically extracts alternative delivery locations from order remarks
- **Status Workflow Management**: Tracks orders through Picked -> Pre-Delivery -> In Delivery -> Delivered
  - **Prep Gating**: Asset tagging, picklist generation, and QA are required before Pre-Delivery
  - **Teams Integration**: Sends automated notifications when orders are ready and when delivery starts
  - **Audit Logging**: Complete audit trail of all status changes
  - **Bulk Operations**: Efficient bulk status transitions for Pre-Delivery queue
  - **Document Signing**: Sign and download delivery PDFs stored in `frontend/public/pdfs`
  - **Local Storage**: Picklists (generated from inFlow data) and QA responses stored under `STORAGE_ROOT` on disk

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
# STORAGE_ROOT=storage
```

   Example `.env` file for Docker PostgreSQL:
   ```
   DATABASE_URL=postgresql://techhub:techhub_password@localhost:5433/techhub_delivery
   INFLOW_API_URL=https://your-inflow-api-url.com
   INFLOW_API_KEY=your-api-key-here
   STORAGE_ROOT=storage
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
   uvicorn app.main:app --reload
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

## Features

### Core Functionality
- **Order Status Workflow**: Picked -> Pre-Delivery -> In Delivery -> Delivered (with Issue tracking)
- **Automated Sync**: Background scheduler syncs picked orders from Inflow every 5 minutes
- **Prep Steps**: Asset tagging, picklist generation, and QA checklist completion required before Pre-Delivery
- **Building Code Extraction**: Automatically extracts building abbreviations from addresses using ArcGIS service
- **Order Remarks Parsing**: Intelligently extracts alternative delivery locations from order remarks
- **Teams Notifications**: Automated notifications when orders are ready and when delivery starts
- **Audit Logging**: Complete audit trail of all status changes with user tracking
- **Bulk Operations**: Efficient bulk status transitions for Pre-Delivery queue management
- **Local Storage**: Picklists (generated from inFlow data) and QA responses stored under `STORAGE_ROOT`

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
