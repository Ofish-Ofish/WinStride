#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sets up the WinStride environment from scratch - installs prerequisites,
    builds the API, Agent, and Web frontend. Database is SQLite (zero config).
    Run this before setup-certs.ps1.

.PARAMETER SkipPrerequisiteCheck
    Skip checking for .NET SDK and Node.js.

.PARAMETER Auto
    Automatically install missing prerequisites without prompting.

.EXAMPLE
    .\setup-winstride.ps1
    .\setup-winstride.ps1 -Auto
#>

param(
    [switch]$SkipPrerequisiteCheck,
    [switch]$Auto
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Paths --

$projectRoot    = Split-Path $PSScriptRoot -Parent
$apiDir         = Join-Path $projectRoot "WinStride-Api\WinStride-Api"
$agentDir       = Join-Path $projectRoot "WinStride-Agent\WinStride-Agent"
$webDir         = Join-Path $projectRoot "Winstride-Web"
$apiCsproj      = Join-Path $apiDir "WinStride-Api.csproj"
$agentCsproj    = Join-Path $agentDir "WinStride-Agent.csproj"

# -- Helpers --

function Write-Step   { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok     { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn   { param([string]$msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Err    { param([string]$msg) Write-Host "    [ERROR] $msg" -ForegroundColor Red }
function Write-Info   { param([string]$msg) Write-Host "    $msg" -ForegroundColor Gray }

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Request-UserConsent {
    param([string]$Prompt)
    if ($Auto) { return $true }
    $response = Read-Host "$Prompt [Y/N]"
    return $response -match '^[Yy]'
}

function Install-Prerequisite {
    param(
        [string]$Name,
        [string]$InstallerUrl,
        [string]$InstallerArgs,
        [string]$FileName
    )

    $tempDir = Join-Path $env:TEMP "winstride-setup"
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    }

    $installerPath = Join-Path $tempDir $FileName

    Write-Info "Downloading $Name..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $oldProgress = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $InstallerUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
        $ProgressPreference = $oldProgress
    } catch {
        $ProgressPreference = $oldProgress
        Write-Err "Failed to download $Name from: $InstallerUrl"
        Write-Err "Error: $_"
        return $false
    }

    if (-not (Test-Path $installerPath) -or (Get-Item $installerPath).Length -eq 0) {
        Write-Err "Downloaded file is missing or empty."
        return $false
    }

    Write-Ok "Downloaded to: $installerPath"
    Write-Info "Installing $Name (this may take a few minutes)..."

    try {
        if ($FileName -match '\.msi$') {
            $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" $InstallerArgs" -Wait -PassThru -ErrorAction Stop
        } else {
            $process = Start-Process -FilePath $installerPath -ArgumentList $InstallerArgs -Wait -PassThru -ErrorAction Stop
        }

        if ($process.ExitCode -ne 0) {
            Write-Err "$Name installer exited with code $($process.ExitCode)"
            return $false
        }

        Write-Ok "$Name installed successfully"
    } catch {
        Write-Err "Failed to run $Name installer: $_"
        return $false
    } finally {
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    }

    # Refresh PATH so we can find the newly installed tool
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"

    return $true
}

# -- Banner --

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WinStride Setup" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Project root: $projectRoot" -ForegroundColor Gray

# -- Validate project structure --

Write-Step "Validating project structure"

$requiredPaths = @(
    @{ Path = $apiDir;       Name = "API directory" },
    @{ Path = $agentDir;     Name = "Agent directory" },
    @{ Path = $webDir;       Name = "Web directory" },
    @{ Path = $apiCsproj;    Name = "API project file" },
    @{ Path = $agentCsproj;  Name = "Agent project file" }
)

$structureValid = $true
foreach ($item in $requiredPaths) {
    if (Test-Path $item.Path) {
        Write-Ok "$($item.Name) found"
    } else {
        Write-Err "$($item.Name) not found at: $($item.Path)"
        $structureValid = $false
    }
}

if (-not $structureValid) {
    Write-Err "Project structure is incomplete. Make sure you're running this from the scripts/ folder."
    exit 1
}

# -- Check prerequisites --

if (-not $SkipPrerequisiteCheck) {
    Write-Step "Checking prerequisites"

    # -- .NET 8 SDK --
    $dotnetOk = $false
    if (Test-Command "dotnet") {
        $dotnetVersions = & dotnet --list-sdks 2>&1
        $has8 = $dotnetVersions | Where-Object { $_ -match "^8\." }
        if ($has8) {
            $dotnetVersion = ($has8 | Select-Object -First 1) -replace '\s*\[.*\]', ''
            Write-Ok ".NET SDK $dotnetVersion"
            $dotnetOk = $true
        }
    }

    if (-not $dotnetOk) {
        Write-Warn ".NET 8 SDK not found."
        if (Request-UserConsent "    Install .NET 8 SDK automatically?") {
            $installed = Install-Prerequisite `
                -Name ".NET 8 SDK" `
                -InstallerUrl "https://aka.ms/dotnet/8.0/dotnet-sdk-win-x64.exe" `
                -InstallerArgs "/install /quiet /norestart" `
                -FileName "dotnet-sdk-8.0-win-x64.exe"

            if (-not $installed -or -not (Test-Command "dotnet")) {
                Write-Err ".NET 8 SDK installation failed or not in PATH."
                Write-Info "Download manually: https://dotnet.microsoft.com/download/dotnet/8.0"
                Write-Warn "You may need to restart your terminal after installing."
                exit 1
            }
            Write-Ok ".NET 8 SDK installed"
        } else {
            Write-Info "Download manually: https://dotnet.microsoft.com/download/dotnet/8.0"
            exit 1
        }
    }

    # -- Node.js --
    $nodeOk = $false
    if (Test-Command "node") {
        $nodeVersion = & node --version 2>&1
        $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($nodeMajor -ge 18) {
            Write-Ok "Node.js $nodeVersion"
            $nodeOk = $true
        } else {
            Write-Warn "Node.js $nodeVersion is too old (need 18+)."
        }
    } else {
        Write-Warn "Node.js not found."
    }

    if (-not $nodeOk) {
        if (Request-UserConsent "    Install Node.js 22 LTS automatically?") {
            $nodeUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
            $installed = Install-Prerequisite `
                -Name "Node.js 22 LTS" `
                -InstallerUrl $nodeUrl `
                -InstallerArgs "/quiet /norestart" `
                -FileName "node-v22-lts-x64.msi"

            if (-not $installed -or -not (Test-Command "node")) {
                Write-Err "Node.js installation failed or not in PATH."
                Write-Info "Download manually: https://nodejs.org"
                Write-Warn "You may need to restart your terminal after installing."
                exit 1
            }
            Write-Ok "Node.js installed"
        } else {
            Write-Info "Download manually: https://nodejs.org"
            exit 1
        }
    }

    # npm (comes with Node.js)
    if (Test-Command "npm") {
        $npmVersion = & npm --version 2>&1
        Write-Ok "npm v$npmVersion"
    } else {
        Write-Err "npm not found (should come with Node.js). Restart your terminal and try again."
        exit 1
    }
} else {
    Write-Warn "Skipping prerequisite checks (-SkipPrerequisiteCheck)"
}

# -- Build API --

Write-Step "Building WinStride API"

try {
    Write-Info "Restoring packages..."
    $restoreResult = & dotnet restore $apiCsproj 2>&1
    if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed: $restoreResult" }
    Write-Ok "Packages restored"

    Write-Info "Building..."
    $buildResult = & dotnet build $apiCsproj --no-restore -c Release 2>&1
    if ($LASTEXITCODE -ne 0) { throw "dotnet build failed: $buildResult" }
    Write-Ok "API built successfully"
} catch {
    Write-Err "API build failed: $_"
    exit 1
}

Write-Ok "Database: SQLite (winstride.db) - created automatically on first run"

# -- Build Agent --

Write-Step "Building WinStride Agent"

try {
    Write-Info "Restoring packages..."
    $restoreResult = & dotnet restore $agentCsproj 2>&1
    if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed: $restoreResult" }
    Write-Ok "Packages restored"

    Write-Info "Building..."
    $buildResult = & dotnet build $agentCsproj --no-restore -c Release 2>&1
    if ($LASTEXITCODE -ne 0) { throw "dotnet build failed: $buildResult" }
    Write-Ok "Agent built successfully"
} catch {
    Write-Err "Agent build failed: $_"
    exit 1
}

# -- Setup Web Frontend --

Write-Step "Setting up Web Frontend"

try {
    Write-Info "Installing npm packages..."
    Push-Location $webDir
    $npmResult = & npm install 2>&1
    Pop-Location
    if ($LASTEXITCODE -ne 0) { throw "npm install failed: $npmResult" }
    Write-Ok "npm packages installed"
} catch {
    Pop-Location -ErrorAction SilentlyContinue
    Write-Err "Frontend setup failed: $_"
    exit 1
}

try {
    Write-Info "Building frontend..."
    Push-Location $webDir
    $buildResult = & npm run build 2>&1
    Pop-Location
    if ($LASTEXITCODE -ne 0) { throw "npm build failed: $buildResult" }
    Write-Ok "Frontend built successfully"
} catch {
    Pop-Location -ErrorAction SilentlyContinue
    Write-Warn "Frontend build failed (non-critical for setup): $_"
    Write-Info "You can still run 'npm run dev' for development."
}

# -- Summary --

Write-Host "`n" -NoNewline
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WINSTRIDE SETUP COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Database: SQLite (auto-created at winstride.db on first API run)" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Run TLS setup:" -ForegroundColor Yellow
Write-Host "       .\scripts\setup-certs.ps1 -CAName `"YourCA`"" -ForegroundColor White
Write-Host ""
Write-Host "    2. Start the API:" -ForegroundColor Yellow
Write-Host "       cd WinStride-Api\WinStride-Api" -ForegroundColor White
Write-Host "       dotnet run" -ForegroundColor White
Write-Host ""
Write-Host "    3. Start the Web UI:" -ForegroundColor Yellow
Write-Host "       cd Winstride-Web" -ForegroundColor White
Write-Host "       npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "    4. Start the Agent (as Administrator):" -ForegroundColor Yellow
Write-Host "       cd WinStride-Agent\WinStride-Agent" -ForegroundColor White
Write-Host "       dotnet run" -ForegroundColor White
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
