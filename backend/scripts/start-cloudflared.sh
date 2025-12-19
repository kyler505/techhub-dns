#!/bin/bash
# Start Cloudflare Tunnel for local webhook testing

set -e

PORT=${1:-8000}

echo ""
echo "========================================"
echo "  Cloudflare Tunnel Webhook Setup"
echo "========================================"
echo ""

# Check if backend is running
echo "Checking if backend is running on port $PORT..."
if ! curl -s --max-time 5 http://localhost:$PORT/health > /dev/null; then
    echo "[ERROR] Backend server is not running on port $PORT"
    echo "  Please start your backend server first:"
    echo "    cd backend"
    echo "    source .venv/bin/activate"
    echo "    uvicorn app.main:app --reload"
    echo ""
    exit 1
fi
echo "[OK] Backend server is running"

echo ""
echo "Starting Cloudflare Tunnel..."
echo "  Port: $PORT"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "[ERROR] cloudflared is not installed"
    echo "  Please install Cloudflare Tunnel first:"
    echo "    Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/"
    echo "    Or use: brew install cloudflared"
    echo ""
    exit 1
fi

echo ""
echo "Starting tunnel and registering webhook..."
echo "  This may take a few moments..."
echo ""

# Start cloudflared and capture the URL
echo "Starting tunnel..."
cloudflared tunnel --url http://localhost:$PORT > cloudflared_output.log 2>&1 &
CLOUDFLARED_PID=$!

# Wait for tunnel to start and extract URL
echo "Waiting for tunnel URL..."
TIMEOUT=30
ELAPSED=0
TUNNEL_URL=""

while [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))

    if [ -f "cloudflared_output.log" ]; then
        TUNNEL_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' cloudflared_output.log | head -1)
        if [ -n "$TUNNEL_URL" ]; then
            break
        fi
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "[ERROR] Failed to get tunnel URL within $TIMEOUT seconds"
    kill $CLOUDFLARED_PID 2>/dev/null || true
    rm -f cloudflared_output.log
    exit 1
fi

echo "Tunnel established!"
echo "  URL: $TUNNEL_URL"
echo ""

# Register the webhook
WEBHOOK_URL="$TUNNEL_URL/api/inflow/webhook"
echo "Registering webhook with Inflow..."
echo "  Webhook URL: $WEBHOOK_URL"

# Activate virtual environment and run webhook registration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_CMD="python $SCRIPT_DIR/manage_inflow_webhook.py reset --url $WEBHOOK_URL --events orderCreated,orderUpdated"

echo "  Running: $PYTHON_CMD"

if eval "$PYTHON_CMD"; then
    echo "[OK] Webhook registered successfully"
    echo ""
    echo "Webhook setup complete!"
    echo "  Tunnel URL: $TUNNEL_URL"
    echo "  Webhook URL: $WEBHOOK_URL"
    echo ""
    echo "Press Ctrl+C to stop the tunnel"
    echo ""

    # Wait for tunnel to be stopped
    wait $CLOUDFLARED_PID
else
    echo "[ERROR] Failed to register webhook"
    kill $CLOUDFLARED_PID 2>/dev/null || true
    rm -f cloudflared_output.log
    exit 1
fi

# Clean up
rm -f cloudflared_output.log
