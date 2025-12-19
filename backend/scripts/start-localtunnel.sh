#!/bin/bash
#
# Start LocalTunnel for local webhook testing
#
# This script starts LocalTunnel to expose your local backend (port 8000)
# to the internet, allowing Inflow webhooks to reach your local development server.
#
# Usage:
#     ./start-localtunnel.sh
#     ./start-localtunnel.sh 8000 my-unique-name
#
# Parameters:
#     Port (default: 8000)
#     Subdomain (default: techhub-delivery-test)
#

PORT=${1:-8000}
SUBDOMAIN=${2:-techhub-delivery-test}

echo ""
echo "========================================"
echo "  LocalTunnel Webhook Tunnel Setup"
echo "========================================"
echo ""

# Check if backend is running
echo "Checking if backend is running on port $PORT..."
if curl -s -f "http://localhost:$PORT/health" > /dev/null 2>&1; then
    echo "✓ Backend server is running"
else
    echo "✗ Backend server is not running on port $PORT"
    echo "  Please start your backend server first:"
    echo "    cd backend"
    echo "    source .venv/bin/activate"
    echo "    uvicorn app.main:app --reload"
    echo ""
    exit 1
fi

echo ""
echo "Starting LocalTunnel..."
echo "  Port: $PORT"
echo "  Subdomain: $SUBDOMAIN"
echo ""

# Check if localtunnel is installed
if command -v lt &> /dev/null; then
    echo "Using global LocalTunnel installation"
    echo ""
    echo "Your webhook URL will be:"
    echo "  https://$SUBDOMAIN.loca.lt/api/inflow/webhook"
    echo ""
    echo "Press Ctrl+C to stop the tunnel"
    echo ""

    lt --port $PORT --subdomain $SUBDOMAIN
else
    echo "Using npx to run LocalTunnel (no installation required)"
    echo ""
    echo "Your webhook URL will be:"
    echo "  https://$SUBDOMAIN.loca.lt/api/inflow/webhook"
    echo ""
    echo "Press Ctrl+C to stop the tunnel"
    echo ""

    npx localtunnel --port $PORT --subdomain $SUBDOMAIN
fi
