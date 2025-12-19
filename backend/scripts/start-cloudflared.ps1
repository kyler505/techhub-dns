#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start Cloudflare Tunnel for local webhook testing

.DESCRIPTION
    This script starts Cloudflare Tunnel to expose your local backend (port 8000)
    to the internet, allowing Inflow webhooks to reach your local development server.
    It automatically registers the webhook with the generated tunnel URL.

.PARAMETER Port
    The port your backend server is running on (default: 8000)

.EXAMPLE
    .\start-cloudflared.ps1

.EXAMPLE
    .\start-cloudflared.ps1 -Port 8000

.NOTES
    - Make sure your backend server is running before starting Cloudflare Tunnel
    - The webhook URL will be: https://<random-subdomain>.trycloudflare.com/api/inflow/webhook
    - The script will automatically register the webhook with Inflow
    - Press Ctrl+C to stop the tunnel
#>

param(
    [int]$Port = 8000
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cloudflare Tunnel Webhook Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
Write-Host "Checking if backend is running on port $Port..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "[OK] Backend server is running" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Backend server is not running on port $Port" -ForegroundColor Red
    Write-Host "  Error details: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Please start your backend server first:" -ForegroundColor Yellow
    Write-Host "    cd backend" -ForegroundColor Gray
    Write-Host "    .venv\Scripts\Activate.ps1" -ForegroundColor Gray
    Write-Host "    uvicorn app.main:app --reload" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Starting Cloudflare Tunnel..." -ForegroundColor Yellow
Write-Host "  Port: $Port" -ForegroundColor Gray
Write-Host ""

# Check if cloudflared is installed
try {
    $null = Get-Command cloudflared -ErrorAction Stop
    Write-Host "Cloudflare Tunnel is installed" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] cloudflared is not installed" -ForegroundColor Red
    Write-Host "  Please install Cloudflare Tunnel first:" -ForegroundColor Yellow
    Write-Host "    Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/" -ForegroundColor Gray
    Write-Host "    Or use: winget install --id Cloudflare.cloudflared" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Starting tunnel and registering webhook..." -ForegroundColor Yellow
Write-Host "  This may take a few moments..." -ForegroundColor Yellow
Write-Host ""

# Start cloudflared in background and capture output
$job = Start-Job -ScriptBlock {
    param($Port)
    try {
        $process = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "http://localhost:$Port" -NoNewWindow -PassThru -RedirectStandardOutput "cloudflared_output.txt" -RedirectStandardError "cloudflared_error.txt"

        # Wait for the tunnel to start and get the URL
        Start-Sleep -Seconds 10

        # Read both stdout and stderr to find the tunnel URL
        $output = Get-Content "cloudflared_output.txt" -ErrorAction SilentlyContinue
        $errorOutput = Get-Content "cloudflared_error.txt" -ErrorAction SilentlyContinue
        $allOutput = $output + $errorOutput
        $url = $null

        foreach ($line in $allOutput) {
            if ($line -match "https://([a-z0-9-]+)\.trycloudflare\.com") {
                $url = $matches[0]
                break
            }
        }

        if ($url) {
            Write-Output "TUNNEL_URL:$url"
        } else {
            Write-Output "ERROR:Could not find tunnel URL in output. Output was: $($allOutput -join '; ')"
        }

        # Wait for the process to finish
        $process.WaitForExit()
    } catch {
        Write-Output "ERROR:$($_.Exception.Message)"
    }
} -ArgumentList $Port

# Wait for the job to complete or timeout
$timeout = 60
$elapsed = 0
$url = $null

while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 2
    $elapsed += 2

    $jobOutput = Receive-Job -Job $job -Keep
    if ($jobOutput) {
        foreach ($line in $jobOutput) {
            if ($line -match "^TUNNEL_URL:(.+)") {
                $url = $matches[1]
                break
            } elseif ($line -match "^ERROR:(.+)") {
                Write-Host "[ERROR] $($matches[1])" -ForegroundColor Red
                exit 1
            }
        }
        if ($url) { break }
    }
}

if (-not $url) {
    Write-Host "[ERROR] Failed to get tunnel URL within $timeout seconds" -ForegroundColor Red
    Write-Host "  This might be due to network issues or cloudflared configuration problems." -ForegroundColor Yellow
    Write-Host "  Try running 'cloudflared tunnel --url http://localhost:8000' manually to debug." -ForegroundColor Yellow
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "Tunnel established!" -ForegroundColor Green
Write-Host "  URL: $url" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host ""

# Register the webhook
$webhookUrl = "$url/api/inflow/webhook"
Write-Host "Registering webhook with Inflow..." -ForegroundColor Yellow
Write-Host "  Webhook URL: $webhookUrl" -ForegroundColor Gray

try {
    # Activate virtual environment and run the webhook registration
    $scriptPath = Join-Path $PSScriptRoot "manage_inflow_webhook.py"
    $venvPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".venv\Scripts\Activate.ps1"
    $pythonCmd = "$venvPath; python $scriptPath reset --url $webhookUrl --events orderCreated,orderUpdated"

    Write-Host "  Running: $pythonCmd" -ForegroundColor Gray

    # Run the webhook registration
    $registrationResult = & $venvPath; & python $scriptPath reset --url $webhookUrl --events orderCreated,orderUpdated 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Webhook registered successfully" -ForegroundColor Green
        Write-Host ""
        Write-Host "Webhook setup complete!" -ForegroundColor Green
        Write-Host "  Tunnel URL: $url" -ForegroundColor Cyan
        Write-Host "  Webhook URL: $webhookUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host "[ERROR] Failed to register webhook" -ForegroundColor Red
        Write-Host "  Output: $registrationResult" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "[ERROR] Exception during webhook registration: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Wait for the tunnel process to finish
Wait-Job -Job $job
Remove-Job -Job $job

# Clean up temp files
Remove-Item "cloudflared_output.txt" -ErrorAction SilentlyContinue
Remove-Item "cloudflared_error.txt" -ErrorAction SilentlyContinue
