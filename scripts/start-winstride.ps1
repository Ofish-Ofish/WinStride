#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Starts WinStride in service mode by default.
    Publishes the API and agent, installs or updates their Windows services,
    starts them, and optionally launches the web UI dev server.

.PARAMETER NoAgent
    Skip installing and starting the agent service.

.PARAMETER NoWeb
    Skip starting the web frontend dev server.

.PARAMETER DevMode
    Launch the API and agent with dotnet run in separate windows instead of
    installing Windows services.

.EXAMPLE
    .\start-winstride.ps1

.EXAMPLE
    .\start-winstride.ps1 -NoAgent

.EXAMPLE
    .\start-winstride.ps1 -DevMode
#>

param(
    [switch]$NoAgent,
    [switch]$NoWeb,
    [switch]$DevMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent
$apiDir = Join-Path $projectRoot "WinStride-Api\WinStride-Api"
$agentDir = Join-Path $projectRoot "WinStride-Agent\WinStride-Agent"
$webDir = Join-Path $projectRoot "Winstride-Web"
$apiCsproj = Join-Path $apiDir "WinStride-Api.csproj"
$agentCsproj = Join-Path $agentDir "WinStride-Agent.csproj"
$apiAppSettingsTemplate = Join-Path $apiDir "appsettings.json"
$agentConfigTemplate = Join-Path $agentDir "config.yaml"
$agentBinariesSourceDir = Join-Path $agentDir "Binaries"
$autorunsHelperScript = Join-Path $PSScriptRoot "ensure-autoruns.ps1"

$serviceRoot = Join-Path $projectRoot "deploy\services"
$apiInstallDir = Join-Path $serviceRoot "WinStride-Api"
$agentInstallDir = Join-Path $serviceRoot "WinStride-Agent"
$dataDir = Join-Path $serviceRoot "data"
$apiDatabasePath = Join-Path $dataDir "winstride.db"

$apiServiceName = "WinStrideApi"
$apiServiceDisplayName = "WinStride API"
$apiServiceDescription = "WinStride API service."
$agentServiceName = "WinStrideAgent"
$agentServiceDisplayName = "WinStride Agent"
$agentServiceDescription = "Collects Windows telemetry for WinStride."

function Write-Step { param([string]$Message) Write-Host "`n[*] $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    [OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    [!] $Message" -ForegroundColor Yellow }
function Write-Err  { param([string]$Message) Write-Host "    [ERROR] $Message" -ForegroundColor Red }

if (-not (Test-Path $autorunsHelperScript)) {
    Write-Err "Required helper script not found: $autorunsHelperScript"
    exit 1
}

. $autorunsHelperScript

$minimumNode20Version = [version]"20.19.0"
$minimumNode22Version = [version]"22.12.0"

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Parse-NodeVersion {
    param([string]$VersionText)

    if ([string]::IsNullOrWhiteSpace($VersionText)) {
        return $null
    }

    $normalized = $VersionText.Trim()
    if ($normalized.StartsWith("v")) {
        $normalized = $normalized.Substring(1)
    }

    try {
        return [version]$normalized
    } catch {
        return $null
    }
}

function Test-SupportedNodeVersion {
    param([string]$VersionText)

    $parsed = Parse-NodeVersion -VersionText $VersionText
    if ($null -eq $parsed) {
        return $false
    }

    return (
        ($parsed.Major -eq 20 -and $parsed -ge $minimumNode20Version) -or
        ($parsed.Major -ge 22 -and $parsed -ge $minimumNode22Version)
    )
}

function Ensure-WebDependencies {
    param([string]$WebDirectory)

    if (-not (Test-Command "node")) {
        throw "Node.js was not found in PATH."
    }

    $nodeVersion = & node --version 2>&1
    if (-not (Test-SupportedNodeVersion -VersionText $nodeVersion)) {
        throw "Node.js $nodeVersion is not supported. Install Node.js 20.19+ or 22.12+."
    }

    if (-not (Test-Command "npm.cmd")) {
        throw "npm.cmd was not found in PATH."
    }

    $viteCmd = Join-Path $WebDirectory "node_modules\.bin\vite.cmd"
    if (Test-Path $viteCmd) {
        Write-Ok "Web dependencies already installed"
        return
    }

    Write-Step "Installing web dependencies"
    Push-Location $WebDirectory
    try {
        & npm.cmd install --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed for the web frontend."
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $viteCmd)) {
        throw "Web dependencies were installed, but Vite was not found at $viteCmd."
    }

    Write-Ok "Web dependencies installed"
}

function Wait-ForLocalPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 15
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $_.LocalPort -eq $Port } |
            Select-Object -First 1

        if ($listener) {
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Test-DotNet {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        throw ".NET SDK was not found in PATH."
    }

    $sdkList = & dotnet --list-sdks 2>&1
    if (-not ($sdkList | Where-Object { $_ -match '^8\.' })) {
        throw ".NET 8 SDK was not found."
    }
}

function Test-ServiceExists {
    param([string]$Name)
    return $null -ne (Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

function Stop-ServiceIfInstalled {
    param([string]$Name)

    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($null -eq $service) {
        return
    }

    if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
        Stop-Service -Name $Name -Force -ErrorAction Stop
        $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(20))
    }
}

function Remove-ServiceIfInstalled {
    param([string]$Name)

    if (-not (Test-ServiceExists -Name $Name)) {
        return
    }

    Stop-ServiceIfInstalled -Name $Name
    & sc.exe delete $Name | Out-Null

    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-ServiceExists -Name $Name)) {
            return
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Timed out waiting for service '$Name' to be removed."
}

function Publish-Project {
    param(
        [string]$ProjectDirectory,
        [string]$ProjectFile,
        [string]$OutputDir,
        [string]$Label
    )

    Write-Step "Publishing $Label"

    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    Push-Location $ProjectDirectory
    try {
        & dotnet publish $ProjectFile -c Release -o $OutputDir /p:UseAppHost=true
        if ($LASTEXITCODE -ne 0) {
            throw "dotnet publish failed for $Label."
        }
    } finally {
        Pop-Location
    }

    Write-Ok "Published $Label to: $OutputDir"
}

function Update-JsonFile {
    param(
        [string]$FilePath,
        [scriptblock]$Mutator
    )

    if (-not (Test-Path $FilePath)) {
        throw "JSON file not found: $FilePath"
    }

    $json = Get-Content $FilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    & $Mutator $json
    $json | ConvertTo-Json -Depth 10 | Set-Content $FilePath -Encoding UTF8 -ErrorAction Stop
}

function Load-AgentConfigValue {
    param(
        [string]$FilePath,
        [string]$Key
    )

    $content = Get-Content $FilePath -Raw -ErrorAction Stop
    $pattern = "(?m)^\s*${Key}:\s*`"?(.*?)`"?\s*$"
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) {
        return ""
    }

    return $match.Groups[1].Value.Trim()
}

function Install-Service {
    param(
        [string]$Name,
        [string]$DisplayName,
        [string]$Description,
        [string]$ExecutablePath
    )

    if (-not (Test-Path $ExecutablePath)) {
        throw "Service executable not found: $ExecutablePath"
    }

    $quotedPath = '"' + $ExecutablePath + '"'
    New-Service -Name $Name -BinaryPathName $quotedPath -DisplayName $DisplayName -StartupType Automatic | Out-Null
    & sc.exe description $Name $Description | Out-Null
}

function Start-ServiceAndWait {
    param([string]$Name)

    Start-Service -Name $Name -ErrorAction Stop
    $service = Get-Service -Name $Name -ErrorAction Stop
    $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(20))
}

function Start-WebUi {
    if ($NoWeb) {
        return
    }

    Ensure-WebDependencies -WebDirectory $webDir

    Write-Step "Starting Web Frontend"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$webDir'; Write-Host 'WinStride Web' -ForegroundColor Cyan; npm.cmd run dev" | Out-Null

    if (Wait-ForLocalPort -Port 5173 -TimeoutSeconds 15) {
        Write-Ok "Web UI available on http://localhost:5173"
    } else {
        Write-Warn "Web frontend window launched, but port 5173 did not open within 15 seconds."
        Write-Warn "Check the web window for npm/Vite errors."
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WinStride Start" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

Refresh-ProcessPath

$valid = $true
if (-not (Test-Path $apiDir)) { Write-Err "API directory not found: $apiDir"; $valid = $false }
if (-not (Test-Path $apiCsproj)) { Write-Err "API project file not found: $apiCsproj"; $valid = $false }
if (-not $NoAgent -and -not (Test-Path $agentDir)) { Write-Err "Agent directory not found: $agentDir"; $valid = $false }
if (-not $NoAgent -and -not (Test-Path $agentCsproj)) { Write-Err "Agent project file not found: $agentCsproj"; $valid = $false }
if (-not $NoAgent -and -not (Test-Path $agentConfigTemplate)) { Write-Err "Agent config not found: $agentConfigTemplate"; $valid = $false }
if (-not $NoWeb -and -not (Test-Path $webDir)) { Write-Err "Web directory not found: $webDir"; $valid = $false }
if (-not $valid) { exit 1 }

if ($DevMode) {
    Write-Step "Starting WinStride in developer mode"

    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$apiDir'; Write-Host 'WinStride API (DevMode)' -ForegroundColor Cyan; dotnet run" | Out-Null
    Write-Ok "API starting on http://localhost:5090"

    if (-not $NoAgent) {
        if (-not (Ensure-AutorunsBinary -TargetDirectory $agentBinariesSourceDir)) {
            Write-Warn "Continuing without autorunsc.exe. Autorun collection will stay unavailable until the binary can be staged."
        }

        Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$agentDir'; Write-Host 'WinStride Agent (DevMode)' -ForegroundColor Cyan; dotnet run" -Verb RunAs | Out-Null
        Write-Ok "Agent starting in developer mode"
    }

    Start-WebUi

    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  WinStride is starting in DevMode" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  API     : http://localhost:5090" -ForegroundColor White
    Write-Host "  Swagger : http://localhost:5090/swagger" -ForegroundColor White
    if (-not $NoWeb) { Write-Host "  Web UI  : http://localhost:5173" -ForegroundColor White }
    if (-not $NoAgent) { Write-Host "  Agent   : dotnet run" -ForegroundColor White }
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    exit 0
}

try {
    Test-DotNet
    Write-Ok ".NET 8 SDK detected"
} catch {
    Write-Err $_.Exception.Message
    Write-Err "Run .\scripts\setup-winstride.ps1 first, or install the .NET 8 SDK."
    exit 1
}

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

$apiRuntimeConfigPath = Join-Path $apiInstallDir "appsettings.json"
$apiExePath = Join-Path $apiInstallDir "WinStride-Api.exe"

Write-Step "Installing WinStride API service"
Stop-ServiceIfInstalled -Name $apiServiceName
Publish-Project -ProjectDirectory $apiDir -ProjectFile $apiCsproj -OutputDir $apiInstallDir -Label "WinStride API"

if (-not (Test-Path $apiRuntimeConfigPath)) {
    throw "Published API config not found: $apiRuntimeConfigPath"
}

Update-JsonFile -FilePath $apiRuntimeConfigPath -Mutator {
    param($json)
    if (-not ($json.PSObject.Properties.Name -contains "ConnectionStrings")) {
        $json | Add-Member -MemberType NoteProperty -Name "ConnectionStrings" -Value ([pscustomobject]@{})
    }

    $json.ConnectionStrings.DefaultConnection = "Data Source=$apiDatabasePath"
}

Remove-ServiceIfInstalled -Name $apiServiceName
Install-Service -Name $apiServiceName -DisplayName $apiServiceDisplayName -Description $apiServiceDescription -ExecutablePath $apiExePath
Start-ServiceAndWait -Name $apiServiceName
Write-Ok "API service is running"

$apiConfig = Get-Content $apiRuntimeConfigPath -Raw | ConvertFrom-Json
$tlsEnabled = -not [string]::IsNullOrWhiteSpace($apiConfig.ServerCertThumbprint)
$apiPort = if ($tlsEnabled) { [int]$apiConfig.HttpsPort } else { [int]$apiConfig.HttpPort }
$apiScheme = if ($tlsEnabled) { "https" } else { "http" }

if (-not $NoAgent) {
    $agentRuntimeConfigPath = Join-Path $agentInstallDir "config.yaml"
    $agentExePath = Join-Path $agentInstallDir "WinStride-Agent.exe"

    Write-Step "Installing WinStride Agent service"
    if (-not (Ensure-AutorunsBinary -TargetDirectory $agentBinariesSourceDir)) {
        Write-Warn "Continuing without autorunsc.exe. Autorun collection will stay unavailable until the binary can be staged."
    }

    Stop-ServiceIfInstalled -Name $agentServiceName
    Publish-Project -ProjectDirectory $agentDir -ProjectFile $agentCsproj -OutputDir $agentInstallDir -Label "WinStride Agent"

    Copy-Item $agentConfigTemplate $agentRuntimeConfigPath -Force
    if (Test-Path $agentBinariesSourceDir) {
        $runtimeBinariesDir = Join-Path $agentInstallDir "Binaries"
        if (-not (Test-Path $runtimeBinariesDir)) {
            New-Item -ItemType Directory -Path $runtimeBinariesDir -Force | Out-Null
        }

        Copy-Item (Join-Path $agentBinariesSourceDir "*") $runtimeBinariesDir -Recurse -Force
    }

    $agentBaseUrl = Load-AgentConfigValue -FilePath $agentRuntimeConfigPath -Key "baseUrl"
    $agentCertThumbprint = Load-AgentConfigValue -FilePath $agentRuntimeConfigPath -Key "certSubject"

    if ($agentBaseUrl.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase)) {
        if ([string]::IsNullOrWhiteSpace($agentCertThumbprint)) {
            throw "Agent config is set to HTTPS but certSubject is empty in $agentRuntimeConfigPath"
        }

        $serviceCert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Thumbprint -eq $agentCertThumbprint }
        if (-not $serviceCert) {
            throw "Agent HTTPS cert '$agentCertThumbprint' was not found in LocalMachine\My. Run .\scripts\setup-certs.ps1 or .\scripts\install-run-agent.ps1 -UseHttps first."
        }
    }

    if (-not (Test-Path (Join-Path $agentInstallDir "Binaries\autorunsc.exe"))) {
        Write-Warn "autorunsc.exe was not found under $agentInstallDir\Binaries"
        Write-Warn "Autorun collection will log errors until autorunsc.exe is placed there."
    }

    Remove-ServiceIfInstalled -Name $agentServiceName
    Install-Service -Name $agentServiceName -DisplayName $agentServiceDisplayName -Description $agentServiceDescription -ExecutablePath $agentExePath
    Start-ServiceAndWait -Name $agentServiceName
    Write-Ok "Agent service is running"
}

Start-WebUi

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WinStride services are running" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  API service   : $apiServiceName" -ForegroundColor White
Write-Host "  API URL       : ${apiScheme}://localhost:${apiPort}" -ForegroundColor White
Write-Host "  Swagger       : ${apiScheme}://localhost:${apiPort}/swagger" -ForegroundColor White
Write-Host "  API install   : $apiInstallDir" -ForegroundColor White
Write-Host "  API database  : $apiDatabasePath" -ForegroundColor White
if (-not $NoAgent) {
    Write-Host "  Agent service : $agentServiceName" -ForegroundColor White
    Write-Host "  Agent install : $agentInstallDir" -ForegroundColor White
}
if (-not $NoWeb) {
    Write-Host "  Web UI        : http://localhost:5173" -ForegroundColor White
}
Write-Host ""
Write-Host "  Re-run this script after code or config changes to republish and restart services." -ForegroundColor Gray
Write-Host "  Use -DevMode if you want the old dotnet run workflow." -ForegroundColor Gray
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
