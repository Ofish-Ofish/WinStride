#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sets up the WinStride environment from scratch -installs prerequisites,
    configures PostgreSQL, builds the API, Agent, and Web frontend.
    Run this before setup-certs.ps1.

.PARAMETER DbUser
    PostgreSQL username to create. Defaults to "admin".

.PARAMETER DbPassword
    PostgreSQL password. Defaults to "123".

.PARAMETER DbName
    Database name to create. Defaults to "db".

.PARAMETER DbPort
    PostgreSQL port. Defaults to 5432.

.PARAMETER SkipPrerequisiteCheck
    Skip checking for .NET SDK, Node.js, and PostgreSQL.

.EXAMPLE
    .\setup-winstride.ps1
    .\setup-winstride.ps1 -DbUser "myuser" -DbPassword "securepass" -DbName "winstride"
#>

param(
    [string]$DbUser = "admin",
    [string]$DbPassword = "123",
    [string]$DbName = "db",
    [int]$DbPort = 5432,
    [switch]$SkipPrerequisiteCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Paths ────────────────────────────────────────────────────────────────────

$projectRoot    = Split-Path $PSScriptRoot -Parent
$apiDir         = Join-Path $projectRoot "WinStride-Api\WinStride-Api"
$agentDir       = Join-Path $projectRoot "WinStride-Agent\WinStride-Agent"
$webDir         = Join-Path $projectRoot "Winstride-Web"
$apiCsproj      = Join-Path $apiDir "WinStride-Api.csproj"
$agentCsproj    = Join-Path $agentDir "WinStride-Agent.csproj"
$appSettingsPath = Join-Path $apiDir "appsettings.json"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step   { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok     { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn   { param([string]$msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Err    { param([string]$msg) Write-Host "    [ERROR] $msg" -ForegroundColor Red }
function Write-Info   { param([string]$msg) Write-Host "    $msg" -ForegroundColor Gray }

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Find-Psql {
    # Try PATH first
    if (Test-Command "psql") {
        return (Get-Command "psql").Source
    }

    # Search common PostgreSQL install paths
    $searchPaths = @(
        "${env:ProgramFiles}\PostgreSQL",
        "${env:ProgramFiles(x86)}\PostgreSQL",
        "C:\PostgreSQL"
    )

    foreach ($basePath in $searchPaths) {
        if (Test-Path $basePath) {
            $psqlCandidates = Get-ChildItem -Path $basePath -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
                Sort-Object { [version]($_.Directory.Parent.Name) } -Descending -ErrorAction SilentlyContinue
            if ($psqlCandidates) {
                return $psqlCandidates[0].FullName
            }
        }
    }

    return $null
}

function Request-UserConsent {
    param([string]$Prompt)
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
        Invoke-WebRequest -Uri $InstallerUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
    } catch {
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

function Invoke-Psql {
    param(
        [string]$PsqlPath,
        [string]$Command,
        [string]$Database = "postgres",
        [string]$Username = "postgres"
    )

    $env:PGPASSWORD = $null  # Use peer/trust auth for local postgres user initially

    $result = & $PsqlPath -h localhost -p $DbPort -U $Username -d $Database -t -A -c $Command 2>&1
    return $result
}

# ── Banner ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WinStride Setup" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Project root: $projectRoot" -ForegroundColor Gray

# ── Validate project structure ───────────────────────────────────────────────

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

# ── Check prerequisites ─────────────────────────────────────────────────────

if (-not $SkipPrerequisiteCheck) {
    Write-Step "Checking prerequisites"

    # ── .NET 8 SDK ───────────────────────────────────────────────────────
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
            Write-Info "Downloading official dotnet-install script..."
            $dotnetInstallScript = Join-Path $env:TEMP "dotnet-install.ps1"
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri "https://dot.net/v1/dotnet-install.ps1" -OutFile $dotnetInstallScript -UseBasicParsing -ErrorAction Stop
                Write-Ok "Install script downloaded"

                Write-Info "Installing .NET 8 SDK (this may take a few minutes)..."
                & $dotnetInstallScript -Channel 8.0 -InstallDir "${env:ProgramFiles}\dotnet" -ErrorAction Stop

                # Ensure dotnet is in PATH
                $dotnetDir = "${env:ProgramFiles}\dotnet"
                if ($env:Path -notlike "*$dotnetDir*") {
                    $env:Path = "$dotnetDir;$env:Path"
                    [Environment]::SetEnvironmentVariable("Path", "$dotnetDir;$([Environment]::GetEnvironmentVariable('Path', 'Machine'))", "Machine")
                }
            } catch {
                Write-Err "Failed to install .NET 8 SDK: $_"
                Write-Info "Download manually: https://dotnet.microsoft.com/download/dotnet/8.0"
                exit 1
            } finally {
                Remove-Item $dotnetInstallScript -Force -ErrorAction SilentlyContinue
            }

            if (-not (Test-Command "dotnet")) {
                Write-Err ".NET 8 SDK installed but not found in PATH. Restart your terminal and try again."
                exit 1
            }
            Write-Ok ".NET 8 SDK installed"
        } else {
            Write-Info "Download manually: https://dotnet.microsoft.com/download/dotnet/8.0"
            exit 1
        }
    }

    # ── Node.js ──────────────────────────────────────────────────────────
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

    # ── PostgreSQL ───────────────────────────────────────────────────────
    $psqlPath = Find-Psql
    if ($psqlPath) {
        $pgVersion = & $psqlPath --version 2>&1
        Write-Ok "PostgreSQL client: $pgVersion"
        Write-Info "psql path: $psqlPath"
    } else {
        Write-Warn "PostgreSQL not found."
        if (Request-UserConsent "    Install PostgreSQL 16 automatically?") {
            $pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.8-1-windows-x64.exe"
            Write-Warn "The PostgreSQL installer will open interactively."
            Write-Warn "Use the defaults, and remember the superuser password you set."

            $installed = Install-Prerequisite `
                -Name "PostgreSQL 16" `
                -InstallerUrl $pgUrl `
                -InstallerArgs "--mode qt --superpassword `"postgres`" --serverport $DbPort" `
                -FileName "postgresql-16-win-x64.exe"

            $psqlPath = Find-Psql
            if (-not $installed -or -not $psqlPath) {
                Write-Err "PostgreSQL installation failed or psql not found."
                Write-Info "Download manually: https://www.postgresql.org/download/windows/"
                Write-Warn "You may need to restart your terminal after installing."
                exit 1
            }
            Write-Ok "PostgreSQL installed"
        } else {
            Write-Info "Download manually: https://www.postgresql.org/download/windows/"
            exit 1
        }
    }

    # Check PostgreSQL server is running
    $pgRunning = $false
    try {
        $pgTest = & $psqlPath -h localhost -p $DbPort -U postgres -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "PostgreSQL server is running on port $DbPort"
            $pgRunning = $true
        }
    } catch { }

    if (-not $pgRunning) {
        Write-Warn "PostgreSQL server is not responding on port $DbPort"
        Write-Info "Attempting to start the PostgreSQL service..."

        # Try common service names
        $serviceNames = @("postgresql-x64-16", "postgresql-x64-15", "postgresql-x64-14", "postgresql")
        $started = $false
        foreach ($svcName in $serviceNames) {
            $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($svc) {
                if ($svc.Status -ne "Running") {
                    try {
                        Start-Service -Name $svcName -ErrorAction Stop
                        Start-Sleep -Seconds 3
                        Write-Ok "Started service: $svcName"
                        $started = $true
                    } catch {
                        Write-Warn "Could not start service $svcName : $_"
                    }
                } else {
                    Write-Ok "Service $svcName is already running"
                    $started = $true
                }
                break
            }
        }

        if (-not $started) {
            Write-Err "Could not find or start the PostgreSQL service."
            Write-Info "Start it manually via services.msc or: net start postgresql-x64-16"
            exit 1
        }

        # Verify again after starting
        try {
            $pgTest = & $psqlPath -h localhost -p $DbPort -U postgres -c "SELECT 1;" 2>&1
            if ($LASTEXITCODE -ne 0) { throw "still not responding" }
            Write-Ok "PostgreSQL server is now running on port $DbPort"
        } catch {
            Write-Err "PostgreSQL service started but server is not responding."
            Write-Info "Check pg_hba.conf and postgresql.conf for port/auth settings."
            exit 1
        }
    }
} else {
    Write-Warn "Skipping prerequisite checks (-SkipPrerequisiteCheck)"
    $psqlPath = Find-Psql
    if (-not $psqlPath) {
        Write-Err "psql is required even with -SkipPrerequisiteCheck. Cannot find it."
        exit 1
    }
}

# ── Setup PostgreSQL database ────────────────────────────────────────────────

Write-Step "Setting up PostgreSQL database"

# Check if user already exists
$env:PGPASSWORD = $null
$userExists = Invoke-Psql -PsqlPath $psqlPath -Command "SELECT 1 FROM pg_roles WHERE rolname = '$DbUser';"
if ($userExists -match "1") {
    Write-Ok "User '$DbUser' already exists"
} else {
    Write-Info "Creating user '$DbUser'..."
    $createUser = Invoke-Psql -PsqlPath $psqlPath -Command "CREATE USER `"$DbUser`" WITH PASSWORD '$DbPassword' CREATEDB;"
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "User '$DbUser' created"
    } else {
        Write-Err "Failed to create user: $createUser"
        exit 1
    }
}

# Check if database already exists
$dbExists = Invoke-Psql -PsqlPath $psqlPath -Command "SELECT 1 FROM pg_database WHERE datname = '$DbName';"
if ($dbExists -match "1") {
    Write-Ok "Database '$DbName' already exists"
} else {
    Write-Info "Creating database '$DbName'..."
    $createDb = Invoke-Psql -PsqlPath $psqlPath -Command "CREATE DATABASE `"$DbName`" OWNER `"$DbUser`";"
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Database '$DbName' created"
    } else {
        Write-Err "Failed to create database: $createDb"
        exit 1
    }
}

# Grant privileges
$grant = Invoke-Psql -PsqlPath $psqlPath -Command "GRANT ALL PRIVILEGES ON DATABASE `"$DbName`" TO `"$DbUser`";"
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Privileges granted to '$DbUser' on '$DbName'"
}

# Verify connection with the new user
$env:PGPASSWORD = $DbPassword
$connTest = & $psqlPath -h localhost -p $DbPort -U $DbUser -d $DbName -c "SELECT 1;" 2>&1
$env:PGPASSWORD = $null
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Verified: can connect as '$DbUser' to '$DbName'"
} else {
    Write-Err "Cannot connect as '$DbUser' to '$DbName': $connTest"
    Write-Warn "You may need to update pg_hba.conf to allow password authentication."
    Write-Info "Typical location: C:\Program Files\PostgreSQL\<version>\data\pg_hba.conf"
    Write-Info "Change 'scram-sha-256' or 'md5' for local connections, then restart PostgreSQL."
    exit 1
}

# ── Update appsettings.json with connection string ───────────────────────────

Write-Step "Updating API configuration"

$connectionString = "Host=localhost;Port=$DbPort;Database=$DbName;Username=$DbUser;Password=$DbPassword"

if (Test-Path $appSettingsPath) {
    try {
        $appSettings = Get-Content $appSettingsPath -Raw | ConvertFrom-Json

        # Add or update ConnectionStrings section
        if (-not $appSettings.PSObject.Properties['ConnectionStrings']) {
            $appSettings | Add-Member -NotePropertyName "ConnectionStrings" -NotePropertyValue ([PSCustomObject]@{
                DefaultConnection = $connectionString
            })
        } else {
            $appSettings.ConnectionStrings.DefaultConnection = $connectionString
        }

        $appSettings | ConvertTo-Json -Depth 10 | Set-Content $appSettingsPath -Encoding UTF8
        Write-Ok "Connection string written to appsettings.json"
    } catch {
        Write-Err "Failed to update appsettings.json: $_"
        Write-Warn "Manually add ConnectionStrings.DefaultConnection: $connectionString"
    }
} else {
    Write-Err "appsettings.json not found at: $appSettingsPath"
    exit 1
}

# ── Build API ────────────────────────────────────────────────────────────────

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

# ── Run EF Core migrations ──────────────────────────────────────────────────

Write-Step "Running database migrations"

# Check if dotnet-ef tool is installed
$efInstalled = & dotnet tool list --global 2>&1 | Select-String "dotnet-ef"
if (-not $efInstalled) {
    Write-Info "Installing dotnet-ef tool..."
    $installResult = & dotnet tool install --global dotnet-ef 2>&1
    if ($LASTEXITCODE -ne 0) {
        # May already be installed locally or partially
        Write-Warn "Could not install dotnet-ef globally: $installResult"
        Write-Info "Trying to update instead..."
        & dotnet tool update --global dotnet-ef 2>&1 | Out-Null
    }
    Write-Ok "dotnet-ef tool ready"
} else {
    Write-Ok "dotnet-ef tool already installed"
}

try {
    Write-Info "Applying migrations..."
    Push-Location $apiDir
    $migrateResult = & dotnet ef database update 2>&1
    Pop-Location
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $migrateResult" }
    Write-Ok "Database migrations applied"
} catch {
    Pop-Location -ErrorAction SilentlyContinue
    Write-Err "Migration failed: $_"
    Write-Warn "The API will attempt to run migrations on startup as a fallback."
}

# ── Build Agent ──────────────────────────────────────────────────────────────

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

# ── Setup Web Frontend ──────────────────────────────────────────────────────

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

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host "`n" -NoNewline
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WINSTRIDE SETUP COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Database" -ForegroundColor White
Write-Host "    Host     : localhost:$DbPort" -ForegroundColor Gray
Write-Host "    Database : $DbName" -ForegroundColor Gray
Write-Host "    User     : $DbUser" -ForegroundColor Gray
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
