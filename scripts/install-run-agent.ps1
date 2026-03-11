#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Configures the WinStride agent and launches it with sensible defaults.
    HTTP works out of the box against a local WinStride API. HTTPS only needs
    the server address and a client certificate PFX.

.PARAMETER ServerAddress
    API server hostname or IP. Defaults to localhost.

.PARAMETER ServerPort
    API port. Defaults to 5090 for HTTP and 7097 for HTTPS.

.PARAMETER UseHttps
    Configure the agent for HTTPS mutual TLS.

.PARAMETER PfxPath
    Path to the client certificate .pfx file when -UseHttps is specified.

.PARAMETER PfxPassword
    Password for the .pfx file. If omitted, the script prompts securely.

.PARAMETER NoStart
    Configure and build the agent, but do not launch it.

.EXAMPLE
    .\scripts\install-run-agent.ps1

.EXAMPLE
    .\scripts\install-run-agent.ps1 -UseHttps -ServerAddress "dc01.corp.local" -PfxPath ".\WinStride-Agent.pfx"
#>

param(
    [string]$ServerAddress = "localhost",
    [int]$ServerPort = 0,
    [switch]$UseHttps,
    [string]$PfxPath = "",
    [SecureString]$PfxPassword,
    [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent
$agentDir = Join-Path $projectRoot "WinStride-Agent\WinStride-Agent"
$configPath = Join-Path $agentDir "config.yaml"
$agentCsproj = Join-Path $agentDir "WinStride-Agent.csproj"
$scheme = if ($UseHttps) { "https" } else { "http" }
$effectivePort = if ($ServerPort -gt 0) { $ServerPort } elseif ($UseHttps) { 7097 } else { 5090 }
$baseUrl = "${scheme}://${ServerAddress}:${effectivePort}/api/Event"
$usingShippedHttpDefaults = (-not $UseHttps) -and $ServerAddress -eq "localhost" -and $effectivePort -eq 5090

function Write-Step { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "    [ERROR] $msg" -ForegroundColor Red }

function Update-YamlValue {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$Value
    )

    if (-not (Test-Path $FilePath)) {
        throw "Config file not found: $FilePath"
    }

    $content = Get-Content $FilePath -Raw -ErrorAction Stop
    $pattern = "(?m)^(\s*${Key}:\s*).*$"

    if ($content -notmatch $pattern) {
        throw "Key '$Key' not found in $FilePath"
    }

    $newContent = $content -replace $pattern, "`${1}`"$Value`""
    Set-Content $FilePath -Value $newContent -Encoding UTF8 -ErrorAction Stop
}

function Write-ManualConfigInstructions {
    param(
        [string]$BaseUrlValue,
        [string]$CertSubjectValue = ""
    )

    Write-Warn "Update the agent config manually in: $configPath"
    Write-Host "       baseUrl: `"$BaseUrlValue`"" -ForegroundColor White

    if ($CertSubjectValue -ne "") {
        Write-Host "       certSubject: `"$CertSubjectValue`"" -ForegroundColor White
    }
}

function Import-ClientCertificate {
    param(
        [string]$ResolvedPfxPath,
        [SecureString]$Password
    )

    $testCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        $ResolvedPfxPath,
        $Password,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet
    )

    try {
        $thumbprint = $testCert.Thumbprint
        $subject = $testCert.Subject
        Write-Ok "PFX is valid - Subject: $subject"
    } finally {
        $testCert.Dispose()
    }

    $existing = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $thumbprint }
    if ($existing) {
        Write-Warn "Certificate already exists in CurrentUser\\My. Reusing thumbprint $thumbprint"
        return ($existing | Select-Object -First 1)
    }

    $imported = Import-PfxCertificate `
        -FilePath $ResolvedPfxPath `
        -CertStoreLocation Cert:\CurrentUser\My `
        -Password $Password `
        -ErrorAction Stop

    Write-Ok "Imported certificate into CurrentUser\\My"
    return $imported
}

function Test-DotNet {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        Write-Err ".NET SDK was not found in PATH."
        Write-Err "Run .\\scripts\\setup-winstride.ps1 first, or install the .NET 8 SDK."
        exit 1
    }

    $sdkList = & dotnet --list-sdks 2>&1
    if (-not ($sdkList | Where-Object { $_ -match '^8\.' })) {
        Write-Err ".NET 8 SDK was not found."
        Write-Err "Run .\\scripts\\setup-winstride.ps1 first, or install the .NET 8 SDK."
        exit 1
    }

    Write-Ok ".NET 8 SDK detected"
}

function Build-Agent {
    Write-Step "Restoring and building the agent"

    Push-Location $agentDir
    try {
        & dotnet restore $agentCsproj
        if ($LASTEXITCODE -ne 0) {
            throw "dotnet restore failed."
        }

        & dotnet build $agentCsproj --no-restore
        if ($LASTEXITCODE -ne 0) {
            throw "dotnet build failed."
        }
    } finally {
        Pop-Location
    }

    Write-Ok "Agent build completed"
}

function Test-AgentConnectivity {
    param(
        [string]$TargetHost,
        [int]$TargetPort
    )

    Write-Step "Testing connectivity to the API"

    try {
        $tcpTest = Test-NetConnection -ComputerName $TargetHost -Port $TargetPort -WarningAction SilentlyContinue
        if ($tcpTest.TcpTestSucceeded) {
            Write-Ok "TCP connection to ${TargetHost}:${TargetPort} succeeded"
        } else {
            Write-Warn "TCP connection to ${TargetHost}:${TargetPort} failed"
            Write-Warn "The agent will still be configured, but the API may not be running or reachable yet."
        }
    } catch {
        Write-Warn "Could not test connectivity: $($_.Exception.Message)"
    }
}

function Start-Agent {
    Write-Step "Starting the WinStride agent"

    $launchCommand = "Set-Location '$agentDir'; Write-Host 'WinStride Agent' -ForegroundColor Cyan; dotnet run"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $launchCommand | Out-Null

    Write-Ok "Agent started in a new PowerShell window"
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WinStride Agent Install + Run" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $agentDir) -or -not (Test-Path $configPath) -or -not (Test-Path $agentCsproj)) {
    Write-Err "Agent project files were not found under: $agentDir"
    exit 1
}

Test-DotNet

$certThumbprint = ""
$configUpdated = $false

if ($UseHttps) {
    Write-Step "Configuring HTTPS agent settings"

    if ([string]::IsNullOrWhiteSpace($PfxPath)) {
        Write-Err "-UseHttps requires -PfxPath."
        exit 1
    }

    $resolvedPfx = Resolve-Path $PfxPath -ErrorAction SilentlyContinue
    if (-not $resolvedPfx -or -not (Test-Path $resolvedPfx)) {
        Write-Err "PFX file not found: $PfxPath"
        exit 1
    }

    if (-not $PfxPassword) {
        $PfxPassword = Read-Host -Prompt "    Enter PFX password" -AsSecureString
        if ($PfxPassword.Length -eq 0) {
            Write-Err "Password cannot be empty."
            exit 1
        }
    }

    $importedCert = Import-ClientCertificate -ResolvedPfxPath $resolvedPfx.Path -Password $PfxPassword
    if (-not $importedCert.HasPrivateKey) {
        Write-Err "Imported certificate does not have a private key."
        exit 1
    }

    $certThumbprint = $importedCert.Thumbprint
    try {
        Update-YamlValue -FilePath $configPath -Key "baseUrl" -Value $baseUrl
        Update-YamlValue -FilePath $configPath -Key "certSubject" -Value $certThumbprint
        $configUpdated = $true
    } catch {
        Write-Warn "Failed to update config.yaml automatically: $($_.Exception.Message)"
        Write-ManualConfigInstructions -BaseUrlValue $baseUrl -CertSubjectValue $certThumbprint
        exit 1
    }

    Write-Ok "Configured HTTPS API endpoint: $baseUrl"
    Write-Ok "Configured certSubject thumbprint: $certThumbprint"
} else {
    Write-Step "Configuring HTTP agent settings"

    if ($usingShippedHttpDefaults) {
        Write-Ok "Using shipped HTTP defaults from config.yaml"
    } else {
        try {
            Update-YamlValue -FilePath $configPath -Key "baseUrl" -Value $baseUrl
            $configUpdated = $true
        } catch {
            Write-Warn "Failed to update config.yaml automatically: $($_.Exception.Message)"
            Write-ManualConfigInstructions -BaseUrlValue $baseUrl
            exit 1
        }

        Write-Ok "Configured HTTP API endpoint: $baseUrl"
    }
}

Test-AgentConnectivity -TargetHost $ServerAddress -TargetPort $effectivePort
Build-Agent

if (-not $NoStart) {
    Start-Agent
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  AGENT READY" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Mode        : $($scheme.ToUpperInvariant())" -ForegroundColor White
Write-Host "  API target  : $baseUrl" -ForegroundColor White
if ($UseHttps) {
    Write-Host "  Thumbprint  : $certThumbprint" -ForegroundColor White
}
if ($configUpdated) {
    Write-Host "  Config file : updated $configPath" -ForegroundColor White
} else {
    Write-Host "  Config file : using shipped settings in $configPath" -ForegroundColor White
}
if ($NoStart) {
    Write-Host "  Agent start : skipped (-NoStart)" -ForegroundColor White
} else {
    Write-Host "  Agent start : launched in a new PowerShell window" -ForegroundColor White
}
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
