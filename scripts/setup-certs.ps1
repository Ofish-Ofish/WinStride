#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Generates server and client certificates for WinStride mTLS using an existing AD CS Certificate Authority.

.PARAMETER CAName
    The Common Name of the issuing CA (e.g. "MyDomain-CA").

.PARAMETER ServerDnsNames
    DNS names / IPs the server cert should cover. Defaults to the machine's hostname and localhost.

.PARAMETER ClientName
    Subject name for the client cert. Defaults to "WinStride-Agent".

.PARAMETER ExportPath
    Directory to export the client .pfx and update config files. Defaults to .\certs

.PARAMETER ValidityYears
    How many years the certs should be valid. Defaults to 2.

.EXAMPLE
    .\setup-certs.ps1 -CAName "MyDomain-CA"
    .\setup-certs.ps1 -CAName "MyDomain-CA" -ServerDnsNames "server1.local","192.168.1.10" -ClientName "Agent-PC01"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$CAName,

    [string[]]$ServerDnsNames,

    [string]$ClientName = "WinStride-Agent",

    [string]$ExportPath = (Join-Path $PSScriptRoot "certs"),

    [int]$ValidityYears = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step  { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "    [ERROR] $msg" -ForegroundColor Red }

function Find-CA {
    param([string]$Name)

    # Search LocalMachine stores for the CA
    foreach ($location in @("LocalMachine", "CurrentUser")) {
        foreach ($storeName in @("Root", "CA", "My")) {
            try {
                $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, $location)
                $store.Open("ReadOnly")
                $found = $store.Certificates | Where-Object {
                    $_.Subject -match "CN\s*=\s*$([regex]::Escape($Name))" -and
                    $_.Extensions | Where-Object {
                        $_.Oid.FriendlyName -eq "Basic Constraints" -and $_.CertificateAuthority
                    }
                }
                $store.Close()

                if ($found) {
                    return $found | Select-Object -First 1
                }
            } catch {
                # Store may not exist or be accessible, continue
            }
        }
    }
    return $null
}

function Update-JsonFile {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$Value
    )

    if (-not (Test-Path $FilePath)) {
        throw "Config file not found: $FilePath"
    }

    $content = Get-Content $FilePath -Raw -ErrorAction Stop
    $json = $content | ConvertFrom-Json -ErrorAction Stop

    if (-not ($json.PSObject.Properties.Name -contains $Key)) {
        throw "Key '$Key' not found in $FilePath"
    }

    $json.$Key = $Value
    $json | ConvertTo-Json -Depth 10 | Set-Content $FilePath -Encoding UTF8 -ErrorAction Stop
}

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

Write-Step "Validating prerequisites"

# Check certreq is available (AD CS enrollment)
$certreqPath = Get-Command certreq.exe -ErrorAction SilentlyContinue
if (-not $certreqPath) {
    Write-Err "certreq.exe not found. This script requires AD CS tools."
    exit 1
}
Write-Ok "certreq.exe found"

# Validate CA exists in cert store
$caCert = Find-CA -Name $CAName
if (-not $caCert) {
    Write-Err "CA '$CAName' not found in any certificate store."
    Write-Host "    Available CAs:" -ForegroundColor Yellow
    $allCAs = Get-ChildItem Cert:\LocalMachine\Root | Where-Object {
        $_.Extensions | Where-Object { $_.Oid.FriendlyName -eq "Basic Constraints" -and $_.CertificateAuthority }
    }
    foreach ($ca in $allCAs) {
        Write-Host "      - $($ca.Subject)" -ForegroundColor Yellow
    }
    exit 1
}
Write-Ok "Found CA: $($caCert.Subject) (Thumbprint: $($caCert.Thumbprint))"

# Set default DNS names if not provided
if (-not $ServerDnsNames -or $ServerDnsNames.Count -eq 0) {
    $ServerDnsNames = @($env:COMPUTERNAME, "localhost", "127.0.0.1")
    Write-Warn "No -ServerDnsNames provided, defaulting to: $($ServerDnsNames -join ', ')"
}

# Create export directory
if (-not (Test-Path $ExportPath)) {
    New-Item -ItemType Directory -Path $ExportPath -Force | Out-Null
    Write-Ok "Created export directory: $ExportPath"
} else {
    Write-Ok "Export directory exists: $ExportPath"
}

# ── Generate server certificate ──────────────────────────────────────────────

Write-Step "Generating server certificate request"

$serverInfPath = Join-Path $env:TEMP "winstride-server.inf"
$serverReqPath = Join-Path $env:TEMP "winstride-server.req"
$serverCerPath = Join-Path $env:TEMP "winstride-server.cer"

# Build SAN entries
$sanEntries = @()
$dnsIndex = 1
$ipIndex = 1
foreach ($name in $ServerDnsNames) {
    if ($name -match '^\d{1,3}(\.\d{1,3}){3}$') {
        $sanEntries += "IPAddress$ipIndex = $name"
        $ipIndex++
    } else {
        $sanEntries += "DNS.$dnsIndex = $name"
        $dnsIndex++
    }
}

$serverInf = @"
[Version]
Signature = "`$Windows NT`$"

[NewRequest]
Subject = "CN=WinStride-Server"
KeyLength = 2048
KeySpec = 1
KeyUsage = 0xA0
MachineKeySet = TRUE
Exportable = FALSE
RequestType = PKCS10
ProviderName = "Microsoft RSA SChannel Cryptographic Provider"
HashAlgorithm = SHA256

[EnhancedKeyUsageExtension]
OID = 1.3.6.1.5.5.7.3.1

[Extensions]
2.5.29.17 = "{text}"
$($sanEntries -join "`n")
"@

try {
    Set-Content $serverInfPath -Value $serverInf -Encoding ASCII -ErrorAction Stop
    Write-Ok "Server certificate request file created"
} catch {
    Write-Err "Failed to create server INF file: $_"
    exit 1
}

Write-Step "Submitting server certificate request to CA"

try {
    $result = & certreq.exe -new $serverInfPath $serverReqPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "certreq -new failed: $result" }
    Write-Ok "Certificate request created"

    $result = & certreq.exe -submit -config "-" -attrib "CertificateTemplate:WebServer" $serverReqPath $serverCerPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "certreq -submit failed: $result" }
    Write-Ok "Server certificate issued by CA"

    $result = & certreq.exe -accept $serverCerPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "certreq -accept failed: $result" }
    Write-Ok "Server certificate installed"
} catch {
    Write-Err "Server certificate enrollment failed: $_"
    Write-Warn "Make sure the CA is reachable and the 'WebServer' template is available."
    exit 1
} finally {
    # Cleanup temp files
    Remove-Item $serverInfPath -Force -ErrorAction SilentlyContinue
    Remove-Item $serverReqPath -Force -ErrorAction SilentlyContinue
    Remove-Item $serverCerPath -Force -ErrorAction SilentlyContinue
}

# Find the server cert we just installed
$serverCert = Get-ChildItem Cert:\LocalMachine\My |
    Where-Object { $_.Subject -eq "CN=WinStride-Server" } |
    Sort-Object NotBefore -Descending |
    Select-Object -First 1

if (-not $serverCert) {
    Write-Err "Server certificate was not found in store after installation."
    exit 1
}
Write-Ok "Server cert thumbprint: $($serverCert.Thumbprint)"

# ── Generate client certificate ──────────────────────────────────────────────

Write-Step "Generating client certificate request"

$clientInfPath = Join-Path $env:TEMP "winstride-client.inf"
$clientReqPath = Join-Path $env:TEMP "winstride-client.req"
$clientCerPath = Join-Path $env:TEMP "winstride-client.cer"

$clientInf = @"
[Version]
Signature = "`$Windows NT`$"

[NewRequest]
Subject = "CN=$ClientName"
KeyLength = 2048
KeySpec = 1
KeyUsage = 0x80
MachineKeySet = FALSE
Exportable = TRUE
RequestType = PKCS10
ProviderName = "Microsoft RSA SChannel Cryptographic Provider"
HashAlgorithm = SHA256

[EnhancedKeyUsageExtension]
OID = 1.3.6.1.5.5.7.3.2
"@

try {
    Set-Content $clientInfPath -Value $clientInf -Encoding ASCII -ErrorAction Stop
    Write-Ok "Client certificate request file created"
} catch {
    Write-Err "Failed to create client INF file: $_"
    exit 1
}

Write-Step "Submitting client certificate request to CA"

try {
    $result = & certreq.exe -new $clientInfPath $clientReqPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "certreq -new failed: $result" }
    Write-Ok "Certificate request created"

    $result = & certreq.exe -submit -config "-" -attrib "CertificateTemplate:User" $clientReqPath $clientCerPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "certreq -submit failed: $result" }
    Write-Ok "Client certificate issued by CA"

    $result = & certreq.exe -accept $clientCerPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "certreq -accept failed: $result" }
    Write-Ok "Client certificate installed"
} catch {
    Write-Err "Client certificate enrollment failed: $_"
    Write-Warn "Make sure the CA is reachable and the 'User' template is available."
    exit 1
} finally {
    Remove-Item $clientInfPath -Force -ErrorAction SilentlyContinue
    Remove-Item $clientReqPath -Force -ErrorAction SilentlyContinue
    Remove-Item $clientCerPath -Force -ErrorAction SilentlyContinue
}

# Find the client cert
$clientCert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq "CN=$ClientName" } |
    Sort-Object NotBefore -Descending |
    Select-Object -First 1

if (-not $clientCert) {
    Write-Err "Client certificate was not found in store after installation."
    exit 1
}
Write-Ok "Client cert thumbprint: $($clientCert.Thumbprint)"

# ── Export client cert for agent machines ────────────────────────────────────

Write-Step "Exporting client certificate for agent distribution"

$pfxPath = Join-Path $ExportPath "$ClientName.pfx"

# Generate a random password for the PFX
$pfxPasswordPlain = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
$pfxPassword = ConvertTo-SecureString -String $pfxPasswordPlain -Force -AsPlainText

try {
    Export-PfxCertificate -Cert $clientCert -FilePath $pfxPath -Password $pfxPassword -ErrorAction Stop | Out-Null
    Write-Ok "Client cert exported to: $pfxPath"
} catch {
    Write-Err "Failed to export client certificate: $_"
    exit 1
}

# Import the client cert into LocalMachine\My so the local Windows service can use it.
$serviceClientCert = Get-ChildItem Cert:\LocalMachine\My |
    Where-Object { $_.Thumbprint -eq $clientCert.Thumbprint } |
    Select-Object -First 1

if ($serviceClientCert) {
    Write-Warn "Client cert already exists in LocalMachine\My"
} else {
    try {
        Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\LocalMachine\My -Password $pfxPassword -Exportable -ErrorAction Stop | Out-Null
        Write-Ok "Client cert imported into LocalMachine\My for the local WinStrideAgent service"
    } catch {
        Write-Err "Failed to import client certificate into LocalMachine\My: $_"
        exit 1
    }
}

# Save password to a file (user should delete after distribution)
$pwdFilePath = Join-Path $ExportPath "$ClientName-password.txt"
Set-Content $pwdFilePath -Value $pfxPasswordPlain -Encoding UTF8
Write-Warn "PFX password saved to: $pwdFilePath"
Write-Warn "DELETE this file after distributing the certificate!"

# ── Update config files ─────────────────────────────────────────────────────

Write-Step "Updating configuration files"

$projectRoot = Split-Path $PSScriptRoot -Parent
$apiConfigPath = Join-Path $projectRoot "WinStride-Api\WinStride-Api\appsettings.json"
$agentConfigPath = Join-Path $projectRoot "WinStride-Agent\WinStride-Agent\config.yaml"

# Update API config
if (Test-Path $apiConfigPath) {
    try {
        Update-JsonFile -FilePath $apiConfigPath -Key "ServerCertThumbprint" -Value $serverCert.Thumbprint
        Write-Ok "Updated $apiConfigPath with server thumbprint"
    } catch {
        Write-Err "Failed to update API config: $_"
        Write-Warn "Manually set ServerCertThumbprint to: $($serverCert.Thumbprint)"
    }
} else {
    Write-Warn "API config not found at: $apiConfigPath"
    Write-Warn "Manually set ServerCertThumbprint to: $($serverCert.Thumbprint)"
}

# Update Agent config
if (Test-Path $agentConfigPath) {
    try {
        Update-YamlValue -FilePath $agentConfigPath -Key "certSubject" -Value $clientCert.Thumbprint
        Write-Ok "Updated $agentConfigPath with client thumbprint"
    } catch {
        Write-Err "Failed to update agent config: $_"
        Write-Warn "Manually set certSubject to: $($clientCert.Thumbprint)"
    }

    # Update baseUrl to use HTTPS with the server's address
    try {
        $serverAddr = $ServerDnsNames | Where-Object { $_ -ne "localhost" -and $_ -ne "127.0.0.1" } | Select-Object -First 1
        if (-not $serverAddr) { $serverAddr = "localhost" }
        $tlsBaseUrl = "https://${serverAddr}:7097/api/Event"
        Update-YamlValue -FilePath $agentConfigPath -Key "baseUrl" -Value $tlsBaseUrl
        Write-Ok "Updated baseUrl to: $tlsBaseUrl"
    } catch {
        Write-Err "Failed to update baseUrl: $_"
        Write-Warn "Manually set baseUrl to: https://<server>:7097/api/Event"
    }
} else {
    Write-Warn "Agent config not found at: $agentConfigPath"
    Write-Warn "Manually set certSubject to: $($clientCert.Thumbprint)"
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host "`n" -NoNewline
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Server cert thumbprint : $($serverCert.Thumbprint)" -ForegroundColor White
Write-Host "  Client cert thumbprint : $($clientCert.Thumbprint)" -ForegroundColor White
Write-Host "  Client PFX             : $pfxPath" -ForegroundColor White
Write-Host "  PFX password file      : $pwdFilePath" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps for remote agents:" -ForegroundColor Yellow
Write-Host "    1. Copy '$pfxPath' and 'install-run-agent.ps1' to each agent machine" -ForegroundColor Yellow
Write-Host "    2. If the agent machine is domain joined and WinStride runs on the domain controller, run:" -ForegroundColor Yellow
Write-Host "       powershell -ExecutionPolicy Bypass -File .\install-run-agent.ps1 -UseHttps -PfxPath '$ClientName.pfx'" -ForegroundColor White
Write-Host "    3. Otherwise specify the WinStride server explicitly:" -ForegroundColor Yellow
Write-Host "       powershell -ExecutionPolicy Bypass -File .\install-run-agent.ps1 -UseHttps -PfxPath '$ClientName.pfx' -ServerAddress '<this-machine-ip-or-hostname>'" -ForegroundColor White
Write-Host "    4. Delete the password file after distribution" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
