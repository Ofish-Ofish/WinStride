#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Starts all WinStride components (API, Web UI, Agent) in separate windows.

.PARAMETER NoAgent
    Skip starting the agent.

.PARAMETER NoWeb
    Skip starting the web frontend.

.EXAMPLE
    .\start-winstride.ps1
    .\start-winstride.ps1 -NoAgent
#>

param(
    [switch]$NoAgent,
    [switch]$NoWeb
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent
$apiDir      = Join-Path $projectRoot "WinStride-Api\WinStride-Api"
$agentDir    = Join-Path $projectRoot "WinStride-Agent\WinStride-Agent"
$webDir      = Join-Path $projectRoot "Winstride-Web"

function Write-Step { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Err  { param([string]$msg) Write-Host "    [ERROR] $msg" -ForegroundColor Red }

# -- Validate --

$valid = $true
if (-not (Test-Path $apiDir)) { Write-Err "API directory not found: $apiDir"; $valid = $false }
if (-not $NoAgent -and -not (Test-Path $agentDir)) { Write-Err "Agent directory not found: $agentDir"; $valid = $false }
if (-not $NoWeb -and -not (Test-Path $webDir)) { Write-Err "Web directory not found: $webDir"; $valid = $false }
if (-not $valid) { exit 1 }

# -- Start API --

Write-Step "Starting WinStride API"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$apiDir'; Write-Host 'WinStride API' -ForegroundColor Cyan; dotnet run"
Write-Ok "API starting on http://localhost:5090"

# -- Start Web --

if (-not $NoWeb) {
    Write-Step "Starting Web Frontend"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$webDir'; Write-Host 'WinStride Web' -ForegroundColor Cyan; npm install --silent; npm run dev"
    Write-Ok "Web UI starting on http://localhost:5173"
}

# -- Start Agent --

if (-not $NoAgent) {
    Write-Step "Starting WinStride Agent"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$agentDir'; Write-Host 'WinStride Agent' -ForegroundColor Cyan; dotnet run" -Verb RunAs
    Write-Ok "Agent starting (as Administrator)"
}

# -- Summary --

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WinStride is starting" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  API     : http://localhost:5090" -ForegroundColor White
Write-Host "  Swagger : http://localhost:5090/swagger" -ForegroundColor White
if (-not $NoWeb)   { Write-Host "  Web UI  : http://localhost:5173" -ForegroundColor White }
if (-not $NoAgent) { Write-Host "  Agent   : running as Administrator" -ForegroundColor White }
Write-Host ""
Write-Host "  Each component runs in its own window." -ForegroundColor Gray
Write-Host "  Close the windows or press Ctrl+C in each to stop." -ForegroundColor Gray
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
