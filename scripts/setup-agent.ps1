#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Imports a WinStride client certificate and configures the agent to connect to the server.
    Run this on each agent machine after receiving the .pfx file from setup-certs.ps1.

.PARAMETER PfxPath
    Path to the client certificate .pfx file.

.PARAMETER PfxPassword
    Password for the .pfx file. If not provided, the script will prompt securely.

.PARAMETER ServerIP
    IP address or hostname of the WinStride API server.

.PARAMETER ServerPort
    Port the API is listening on. Defaults to 7097.

.EXAMPLE
    .\setup-agent.ps1 -PfxPath ".\WinStride-Agent.pfx" -ServerIP "192.168.1.10"
    .\setup-agent.ps1 -PfxPath ".\WinStride-Agent.pfx" -ServerIP "server.local" -ServerPort 8443
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$PfxPath,

    [SecureString]$PfxPassword,

    [Parameter(Mandatory = $true)]
    [string]$ServerIP,

    [int]$ServerPort = 7097
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step  { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "    [ERROR] $msg" -ForegroundColor Red }

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

# ── Validation ───────────────────────────────────────────────────────────────

Write-Step "Validating inputs"

# Resolve PFX path
$PfxPath = Resolve-Path $PfxPath -ErrorAction SilentlyContinue
if (-not $PfxPath -or -not (Test-Path $PfxPath)) {
    Write-Err "PFX file not found: $PfxPath"
    exit 1
}
Write-Ok "PFX file found: $PfxPath"

# Validate PFX is a real file
$pfxItem = Get-Item $PfxPath -ErrorAction Stop
if ($pfxItem.Length -eq 0) {
    Write-Err "PFX file is empty."
    exit 1
}
Write-Ok "PFX file size: $($pfxItem.Length) bytes"

# Prompt for password if not provided
if (-not $PfxPassword) {
    $PfxPassword = Read-Host -Prompt "    Enter PFX password" -AsSecureString
    if ($PfxPassword.Length -eq 0) {
        Write-Err "Password cannot be empty."
        exit 1
    }
}

# Validate ServerIP is not empty
if ([string]::IsNullOrWhiteSpace($ServerIP)) {
    Write-Err "ServerIP cannot be empty."
    exit 1
}
Write-Ok "Server target: ${ServerIP}:${ServerPort}"

# ── Import certificate ───────────────────────────────────────────────────────

Write-Step "Importing client certificate"

try {
    # Test that the PFX can be read with the given password
    $testCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        $PfxPath.Path,
        $PfxPassword,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet
    )
    $testThumbprint = $testCert.Thumbprint
    $testSubject = $testCert.Subject
    $testCert.Dispose()
    Write-Ok "PFX is valid — Subject: $testSubject"
} catch {
    Write-Err "Failed to read PFX file. Wrong password or corrupted file."
    Write-Err "Details: $_"
    exit 1
}

# Check if cert already exists in store
$existing = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $testThumbprint }
if ($existing) {
    Write-Warn "Certificate already exists in store (Thumbprint: $testThumbprint)"
    Write-Ok "Skipping import — using existing certificate"
    $importedCert = $existing | Select-Object -First 1
} else {
    try {
        $importedCert = Import-PfxCertificate `
            -FilePath $PfxPath.Path `
            -CertStoreLocation Cert:\CurrentUser\My `
            -Password $PfxPassword `
            -ErrorAction Stop

        Write-Ok "Certificate imported successfully"
    } catch {
        Write-Err "Failed to import certificate: $_"
        exit 1
    }
}

Write-Ok "Thumbprint: $($importedCert.Thumbprint)"

# Verify the cert has a private key
if (-not $importedCert.HasPrivateKey) {
    Write-Err "Imported certificate does not have a private key. The agent cannot authenticate without it."
    exit 1
}
Write-Ok "Private key is present"

# Verify the cert is for client authentication
$clientAuthOid = "1.3.6.1.5.5.7.3.2"
$ekuExtension = $importedCert.Extensions | Where-Object { $_.Oid.FriendlyName -eq "Enhanced Key Usage" }
if ($ekuExtension) {
    $ekus = $ekuExtension.EnhancedKeyUsages
    $hasClientAuth = $ekus | Where-Object { $_.Value -eq $clientAuthOid }
    if ($hasClientAuth) {
        Write-Ok "Certificate has Client Authentication EKU"
    } else {
        Write-Warn "Certificate does NOT have Client Authentication EKU — the server may reject it"
    }
} else {
    Write-Warn "No Enhanced Key Usage extension found — the server may reject it"
}

# ── Update agent config ─────────────────────────────────────────────────────

Write-Step "Updating agent configuration"

# Try to find config.yaml relative to script location or in common paths
$configSearchPaths = @(
    (Join-Path (Split-Path $PSScriptRoot -Parent) "WinStride-Agent\WinStride-Agent\config.yaml"),
    (Join-Path $PSScriptRoot "config.yaml"),
    (Join-Path $PSScriptRoot "..\config.yaml"),
    (Join-Path $env:ProgramFiles "WinStride-Agent\config.yaml"),
    (Join-Path $env:ProgramData "WinStride-Agent\config.yaml")
)

$agentConfigPath = $null
foreach ($searchPath in $configSearchPaths) {
    if (Test-Path $searchPath) {
        $agentConfigPath = $searchPath
        break
    }
}

if (-not $agentConfigPath) {
    Write-Warn "config.yaml not found in expected locations."
    Write-Warn "Searched:"
    foreach ($p in $configSearchPaths) {
        Write-Warn "  - $p"
    }
    Write-Host ""
    Write-Host "    Manually update config.yaml with:" -ForegroundColor Yellow
    Write-Host "      certSubject: `"$($importedCert.Thumbprint)`"" -ForegroundColor White
    Write-Host "      baseUrl: `"https://${ServerIP}:${ServerPort}/api/Event`"" -ForegroundColor White
} else {
    Write-Ok "Found config at: $agentConfigPath"

    # Update certSubject (thumbprint)
    try {
        Update-YamlValue -FilePath $agentConfigPath -Key "certSubject" -Value $importedCert.Thumbprint
        Write-Ok "Updated certSubject with thumbprint"
    } catch {
        Write-Err "Failed to update certSubject: $_"
        Write-Warn "Manually set certSubject to: $($importedCert.Thumbprint)"
    }

    # Update baseUrl
    $newBaseUrl = "https://${ServerIP}:${ServerPort}/api/Event"
    try {
        Update-YamlValue -FilePath $agentConfigPath -Key "baseUrl" -Value $newBaseUrl
        Write-Ok "Updated baseUrl to: $newBaseUrl"
    } catch {
        Write-Err "Failed to update baseUrl: $_"
        Write-Warn "Manually set baseUrl to: $newBaseUrl"
    }
}

# ── Verify connectivity (optional) ──────────────────────────────────────────

Write-Step "Testing connectivity to server"

try {
    $tcpTest = Test-NetConnection -ComputerName $ServerIP -Port $ServerPort -WarningAction SilentlyContinue
    if ($tcpTest.TcpTestSucceeded) {
        Write-Ok "TCP connection to ${ServerIP}:${ServerPort} succeeded"
    } else {
        Write-Warn "TCP connection to ${ServerIP}:${ServerPort} failed"
        Write-Warn "The server may not be running yet, or the port may be blocked by a firewall"
    }
} catch {
    Write-Warn "Could not test connectivity: $_"
    Write-Warn "This is not critical — the agent will retry on startup"
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host "`n" -NoNewline
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AGENT SETUP COMPLETE" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Certificate subject    : $($importedCert.Subject)" -ForegroundColor White
Write-Host "  Certificate thumbprint : $($importedCert.Thumbprint)" -ForegroundColor White
Write-Host "  Server target          : https://${ServerIP}:${ServerPort}" -ForegroundColor White

if ($agentConfigPath) {
    Write-Host "  Config updated         : $agentConfigPath" -ForegroundColor White
}

Write-Host ""
Write-Host "  The agent is ready to connect to the server." -ForegroundColor Green
Write-Host "  Start the agent service to begin sending data." -ForegroundColor Green
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
