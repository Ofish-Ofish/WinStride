#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Publishes, configures, installs, and starts the WinStride agent Windows service.

.PARAMETER ServerAddress
    API server hostname or IP. If omitted, the script assumes the WinStride
    API is running on the Active Directory domain controller for this machine's domain.

.PARAMETER ServerPort
    API port. Defaults to 5090 for HTTP and 7097 for HTTPS.

.PARAMETER UseHttps
    Configure the agent for HTTPS mutual TLS.

.PARAMETER PfxPath
    Path to the client certificate .pfx file when -UseHttps is specified.

.PARAMETER PfxPassword
    Password for the .pfx file. If omitted, the script prompts securely.

.PARAMETER InstallDir
    Published runtime directory for the Windows service.
    Defaults to <repo>\deploy\services\WinStride-Agent

.PARAMETER NoStart
    Configure and install/update the service, but do not start it.

.EXAMPLE
    .\scripts\install-run-agent.ps1

.EXAMPLE
    .\scripts\install-run-agent.ps1 -UseHttps -ServerAddress "dc01.corp.local" -PfxPath ".\WinStride-Agent.pfx"
#>

param(
    [string]$ServerAddress = "",
    [int]$ServerPort = 0,
    [switch]$UseHttps,
    [string]$PfxPath = "",
    [SecureString]$PfxPassword,
    [string]$InstallDir = "",
    [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent
$agentDir = Join-Path $projectRoot "WinStride-Agent\WinStride-Agent"
$agentCsproj = Join-Path $agentDir "WinStride-Agent.csproj"
$configTemplatePath = Join-Path $agentDir "config.yaml"
$binariesSourceDir = Join-Path $agentDir "Binaries"
$autorunsHelperScript = Join-Path $PSScriptRoot "ensure-autoruns.ps1"

$serviceName = "WinStrideAgent"
$serviceDisplayName = "WinStride Agent"
$serviceDescription = "Collects Windows telemetry for WinStride."

$scheme = if ($UseHttps) { "https" } else { "http" }
$effectivePort = if ($ServerPort -gt 0) { $ServerPort } elseif ($UseHttps) { 7097 } else { 5090 }

function Write-Step { param([string]$Message) Write-Host "`n[*] $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    [OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    [!] $Message" -ForegroundColor Yellow }
function Write-Err  { param([string]$Message) Write-Host "    [ERROR] $Message" -ForegroundColor Red }

if (-not (Test-Path $autorunsHelperScript)) {
    Write-Err "Required helper script not found: $autorunsHelperScript"
    exit 1
}

. $autorunsHelperScript

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Show-ServerAddressGuidance {
    param([string]$Reason)

    Write-Err $Reason
    Write-Host "    This installer assumes the WinStride API is hosted on your AD / domain controller." -ForegroundColor Yellow
    Write-Host "    If that is not true, rerun it with the WinStride API server hostname or IP." -ForegroundColor Yellow

    if ($UseHttps) {
        Write-Host "    Example: powershell -ExecutionPolicy Bypass -File .\scripts\install-run-agent.ps1 -UseHttps -PfxPath `"C:\path\WinStride-Agent.pfx`" -ServerAddress `"dc01.corp.local`"" -ForegroundColor White
    } else {
        Write-Host "    Example: powershell -ExecutionPolicy Bypass -File .\scripts\install-run-agent.ps1 -ServerAddress `"dc01.corp.local`"" -ForegroundColor White
    }
}

function Resolve-DomainControllerAddress {
    try {
        $computerSystem = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
    } catch {
        Show-ServerAddressGuidance "Failed to inspect domain membership: $($_.Exception.Message)"
        exit 1
    }

    if (-not $computerSystem.PartOfDomain -or [string]::IsNullOrWhiteSpace($computerSystem.Domain)) {
        Show-ServerAddressGuidance "This machine is not joined to an Active Directory domain, so the API host cannot be discovered automatically."
        exit 1
    }

    $domainName = $computerSystem.Domain.Trim()
    $localMachineName = $env:COMPUTERNAME
    $isDomainController = $computerSystem.DomainRole -in 4, 5
    $candidates = New-Object System.Collections.Generic.List[string]

    try {
        Add-Type -AssemblyName System.DirectoryServices -ErrorAction Stop
        $domain = [System.DirectoryServices.ActiveDirectory.Domain]::GetComputerDomain()
        $domainController = $domain.FindDomainController()
        if (-not [string]::IsNullOrWhiteSpace($domainController.Name)) {
            $candidates.Add($domainController.Name.Trim())
        }
    } catch {
        Write-Warn "DirectoryServices discovery failed: $($_.Exception.Message)"
    }

    try {
        $nltestOutput = & nltest /dsgetdc:$domainName 2>$null
        foreach ($line in $nltestOutput) {
            if ($line -match 'DC:\s+\\\\(.+)$') {
                $candidate = $matches[1].Trim()
                if (-not [string]::IsNullOrWhiteSpace($candidate)) {
                    $candidates.Add($candidate)
                    break
                }
            }
        }
    } catch {
        Write-Warn "nltest discovery failed: $($_.Exception.Message)"
    }

    if (-not [string]::IsNullOrWhiteSpace($env:LOGONSERVER)) {
        $logonServer = $env:LOGONSERVER.Trim().TrimStart('\')
        if (-not [string]::IsNullOrWhiteSpace($logonServer)) {
            if ($isDomainController -or -not $logonServer.Equals($localMachineName, [System.StringComparison]::OrdinalIgnoreCase)) {
                $candidates.Add($logonServer)
            }
        }
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            Write-Ok "Using domain controller '$candidate' as the WinStride API host"
            return $candidate
        }
    }

    Show-ServerAddressGuidance "This machine is domain joined to '$domainName', but the domain controller could not be discovered automatically."
    exit 1
}

function Resolve-ApiServerAddress {
    param([string]$RequestedAddress)

    if (-not [string]::IsNullOrWhiteSpace($RequestedAddress)) {
        return $RequestedAddress.Trim()
    }

    Write-Step "Resolving WinStride API host from Active Directory"
    return Resolve-DomainControllerAddress
}

function Resolve-InstallPath {
    param([string]$RequestedPath)

    if ([string]::IsNullOrWhiteSpace($RequestedPath)) {
        return (Join-Path $projectRoot "deploy\services\WinStride-Agent")
    }

    if ([System.IO.Path]::IsPathRooted($RequestedPath)) {
        return [System.IO.Path]::GetFullPath($RequestedPath)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $projectRoot $RequestedPath))
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

function Test-DotNet {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        Write-Err ".NET SDK was not found in PATH."
        Write-Err "Run .\scripts\setup-winstride.ps1 first, or install the .NET 8 SDK."
        exit 1
    }

    $sdkList = & dotnet --list-sdks 2>&1
    if (-not ($sdkList | Where-Object { $_ -match '^8\.' })) {
        Write-Err ".NET 8 SDK was not found."
        Write-Err "Run .\scripts\setup-winstride.ps1 first, or install the .NET 8 SDK."
        exit 1
    }

    Write-Ok ".NET 8 SDK detected"
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
        Write-Step "Stopping existing service: $Name"
        Stop-Service -Name $Name -Force -ErrorAction Stop
        $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(20))
        Write-Ok "Stopped service: $Name"
    }
}

function Remove-ServiceIfInstalled {
    param([string]$Name)

    if (-not (Test-ServiceExists -Name $Name)) {
        return
    }

    Write-Step "Removing existing service: $Name"
    Stop-ServiceIfInstalled -Name $Name

    & sc.exe delete $Name | Out-Null

    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-ServiceExists -Name $Name)) {
            Write-Ok "Removed service: $Name"
            return
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Timed out waiting for service '$Name' to be removed."
}

function Publish-Agent {
    param([string]$OutputDir)

    Write-Step "Publishing WinStride Agent service"

    if (-not (Ensure-AutorunsBinary -TargetDirectory $binariesSourceDir)) {
        Write-Warn "Continuing without autorunsc.exe. Autorun collection will stay unavailable until the binary can be staged."
    }

    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    Push-Location $agentDir
    try {
        & dotnet publish $agentCsproj -c Release -o $OutputDir /p:UseAppHost=true
        if ($LASTEXITCODE -ne 0) {
            throw "dotnet publish failed."
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $configTemplatePath)) {
        throw "Agent config template not found: $configTemplatePath"
    }

    Copy-Item $configTemplatePath (Join-Path $OutputDir "config.yaml") -Force

    if (Test-Path $binariesSourceDir) {
        $runtimeBinariesDir = Join-Path $OutputDir "Binaries"
        if (-not (Test-Path $runtimeBinariesDir)) {
            New-Item -ItemType Directory -Path $runtimeBinariesDir -Force | Out-Null
        }

        Copy-Item (Join-Path $binariesSourceDir "*") $runtimeBinariesDir -Recurse -Force
    }

    Write-Ok "Published agent runtime to: $OutputDir"
}

function Import-ClientCertificate {
    param(
        [string]$ResolvedPfxPath,
        [SecureString]$Password
    )

    $testCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        $ResolvedPfxPath,
        $Password,
        ([System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::MachineKeySet -bor
         [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet)
    )

    try {
        $thumbprint = $testCert.Thumbprint
        $subject = $testCert.Subject
        Write-Ok "PFX is valid - Subject: $subject"
    } finally {
        $testCert.Dispose()
    }

    $existing = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Thumbprint -eq $thumbprint }
    if ($existing) {
        Write-Warn "Certificate already exists in LocalMachine\My. Reusing thumbprint $thumbprint"
        return ($existing | Select-Object -First 1)
    }

    $imported = Import-PfxCertificate `
        -FilePath $ResolvedPfxPath `
        -CertStoreLocation Cert:\LocalMachine\My `
        -Password $Password `
        -Exportable `
        -ErrorAction Stop

    Write-Ok "Imported certificate into LocalMachine\My"
    return $imported
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
    Write-Ok "Installed service: $Name"
}

function Start-ServiceAndWait {
    param([string]$Name)

    Write-Step "Starting service: $Name"
    Start-Service -Name $Name -ErrorAction Stop

    $service = Get-Service -Name $Name -ErrorAction Stop
    $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(20))
    Write-Ok "Service is running: $Name"
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
            Write-Warn "The service is still configured, but the API may not be reachable yet."
        }
    } catch {
        Write-Warn "Could not test connectivity: $($_.Exception.Message)"
    }
}

$installPath = Resolve-InstallPath -RequestedPath $InstallDir
$runtimeConfigPath = Join-Path $installPath "config.yaml"
$serviceExePath = Join-Path $installPath "WinStride-Agent.exe"
$certThumbprint = ""

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WinStride Agent Service Install" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $agentDir) -or -not (Test-Path $agentCsproj) -or -not (Test-Path $configTemplatePath)) {
    Write-Err "Agent project files were not found under: $agentDir"
    exit 1
}

Refresh-ProcessPath
Test-DotNet

$resolvedServerAddress = Resolve-ApiServerAddress -RequestedAddress $ServerAddress
$baseUrl = "${scheme}://${resolvedServerAddress}:${effectivePort}/api/Event"

if ($UseHttps) {
    Write-Step "Configuring HTTPS agent settings"

    if ([string]::IsNullOrWhiteSpace($PfxPath)) {
        Write-Err "-UseHttps requires -PfxPath."
        exit 1
    }

    $resolvedPfx = Resolve-Path $PfxPath -ErrorAction SilentlyContinue
    if (-not $resolvedPfx -or -not (Test-Path $resolvedPfx.Path)) {
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
} else {
    Write-Step "Configuring HTTP agent settings"
}

Stop-ServiceIfInstalled -Name $serviceName
Publish-Agent -OutputDir $installPath

try {
    Update-YamlValue -FilePath $runtimeConfigPath -Key "baseUrl" -Value $baseUrl
    Update-YamlValue -FilePath $runtimeConfigPath -Key "certSubject" -Value $certThumbprint
} catch {
    Write-Err "Failed to update runtime config.yaml automatically: $($_.Exception.Message)"
    Write-Err "Runtime config path: $runtimeConfigPath"
    exit 1
}

if (-not (Test-Path (Join-Path $installPath "Binaries\autorunsc.exe"))) {
    Write-Warn "autorunsc.exe was not found under $installPath\Binaries"
    Write-Warn "Autorun collection will log errors until autorunsc.exe is placed there."
}

Test-AgentConnectivity -TargetHost $resolvedServerAddress -TargetPort $effectivePort
Remove-ServiceIfInstalled -Name $serviceName
Install-Service -Name $serviceName -DisplayName $serviceDisplayName -Description $serviceDescription -ExecutablePath $serviceExePath

if (-not $NoStart) {
    Start-ServiceAndWait -Name $serviceName
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  AGENT SERVICE READY" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Mode         : $($scheme.ToUpperInvariant())" -ForegroundColor White
Write-Host "  API target   : $baseUrl" -ForegroundColor White
Write-Host "  Install dir  : $installPath" -ForegroundColor White
Write-Host "  Runtime conf : $runtimeConfigPath" -ForegroundColor White
Write-Host "  Service      : $serviceName" -ForegroundColor White
if ($UseHttps) {
    Write-Host "  Thumbprint   : $certThumbprint" -ForegroundColor White
}
if ($NoStart) {
    Write-Host "  Service run  : skipped (-NoStart)" -ForegroundColor White
} else {
    Write-Host "  Service run  : started" -ForegroundColor White
}
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
