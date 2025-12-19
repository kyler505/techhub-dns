#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start LocalTunnel for local webhook testing

.DESCRIPTION
    This script starts LocalTunnel to expose your local backend (port 8000)
    to the internet, allowing Inflow webhooks to reach your local development server.

.PARAMETER Port
    The port your backend server is running on (default: 8000)

.PARAMETER Subdomain
    The subdomain to use for LocalTunnel (default: techhub-delivery-test)
    If the subdomain is taken, LocalTunnel will assign a random one.

.EXAMPLE
    .\start-localtunnel.ps1

.EXAMPLE
    .\start-localtunnel.ps1 -Port 8000 -Subdomain my-unique-name

.NOTES
    - Make sure your backend server is running before starting LocalTunnel
    - The webhook URL will be: https://<subdomain>.loca.lt/api/inflow/webhook
    - Update your .env file with the LocalTunnel URL after starting
#>

param(
    [int]$Port = 8000,
    [string]$Subdomain = "techhub-delivery-test"
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LocalTunnel Webhook Tunnel Setup" -ForegroundColor Cyan
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
Write-Host "Starting LocalTunnel..." -ForegroundColor Yellow
Write-Host "  Port: $Port" -ForegroundColor Gray
Write-Host "  Subdomain: $Subdomain" -ForegroundColor Gray
Write-Host ""

# Check if localtunnel is installed, if not use npx
$ltInstalled = $false
try {
    $null = Get-Command lt -ErrorAction Stop
    $ltInstalled = $true
} catch {
    Write-Host "LocalTunnel not installed globally, using npx..." -ForegroundColor Yellow
}

if ($ltInstalled) {
    Write-Host "Using global LocalTunnel installation" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your webhook URL will be:" -ForegroundColor Cyan
    Write-Host "  https://$Subdomain.loca.lt/api/inflow/webhook" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Yellow
    Write-Host ""

    lt --port $Port --subdomain $Subdomain
} else {
    Write-Host "Using npx to run LocalTunnel (no installation required)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your webhook URL will be:" -ForegroundColor Cyan
    Write-Host "  https://$Subdomain.loca.lt/api/inflow/webhook" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Yellow
    Write-Host ""

    npx localtunnel --port $Port --subdomain $Subdomain
}
