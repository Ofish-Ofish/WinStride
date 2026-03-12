#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sets up the WinStride environment from scratch - installs prerequisites
    and validates the repo layout for the service-based install flow.
    Database is SQLite (zero config). Run this before setup-certs.ps1.

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
$apiAppSettings = Join-Path $apiDir "appsettings.json"

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
            # Use cmd /c msiexec to avoid hanging on background MSI service processes
            $exitCode = (Start-Process -FilePath "cmd.exe" -ArgumentList "/c msiexec /i `"$installerPath`" $InstallerArgs" -Wait -PassThru -ErrorAction Stop).ExitCode
        } else {
            $exitCode = (Start-Process -FilePath $installerPath -ArgumentList $InstallerArgs -Wait -PassThru -ErrorAction Stop).ExitCode
        }

        if ($exitCode -ne 0) {
            Write-Err "$Name installer exited with code $exitCode"
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

function Get-ApiPortConfig {
    param([string]$AppSettingsPath)

    $defaults = @{
        HttpPort = 5090
        HttpsPort = 7097
        TlsEnabled = $false
    }

    if (-not (Test-Path $AppSettingsPath)) {
        return $defaults
    }

    try {
        $config = Get-Content $AppSettingsPath -Raw | ConvertFrom-Json
        $httpPort = if ($config.HttpPort) { [int]$config.HttpPort } else { 5090 }
        $httpsPort = if ($config.HttpsPort) { [int]$config.HttpsPort } else { 7097 }
        $tlsEnabled = -not [string]::IsNullOrWhiteSpace($config.ServerCertThumbprint)

        return @{
            HttpPort = $httpPort
            HttpsPort = $httpsPort
            TlsEnabled = $tlsEnabled
        }
    } catch {
        Write-Warn "Failed to read API port config from appsettings.json. Using defaults."
        return $defaults
    }
}

function Get-DomainComputerEntries {
    param([string]$DomainName)

    $entries = New-Object System.Collections.Generic.List[object]

    if (Get-Command Get-ADComputer -ErrorAction SilentlyContinue) {
        try {
            Import-Module ActiveDirectory -ErrorAction Stop
            $computers = Get-ADComputer -Filter * -Properties DNSHostName, IPv4Address, Enabled -ErrorAction Stop |
                Where-Object { $_.Enabled }

            foreach ($computer in $computers) {
                $hostName = if (-not [string]::IsNullOrWhiteSpace($computer.DNSHostName)) {
                    $computer.DNSHostName.Trim()
                } else {
                    "$($computer.Name).$DomainName"
                }

                $entries.Add([pscustomobject]@{
                    HostName = $hostName
                    IPv4Address = $computer.IPv4Address
                })
            }

            return $entries
        } catch {
            Write-Warn "ActiveDirectory module lookup failed: $($_.Exception.Message)"
        }
    }

    try {
        Add-Type -AssemblyName System.DirectoryServices -ErrorAction Stop
        $rootDse = [ADSI]"LDAP://RootDSE"
        $defaultNamingContext = [string]$rootDse.defaultNamingContext
        if ([string]::IsNullOrWhiteSpace($defaultNamingContext)) {
            throw "RootDSE did not return a default naming context."
        }

        $searcher = New-Object System.DirectoryServices.DirectorySearcher([ADSI]("LDAP://$defaultNamingContext"))
        $searcher.Filter = "(&(objectCategory=computer)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
        $searcher.PageSize = 1000
        [void]$searcher.PropertiesToLoad.Add("dNSHostName")
        [void]$searcher.PropertiesToLoad.Add("name")

        foreach ($result in $searcher.FindAll()) {
            $dnsHostName = if ($result.Properties["dnshostname"].Count -gt 0) {
                [string]$result.Properties["dnshostname"][0]
            } elseif ($result.Properties["name"].Count -gt 0) {
                "$([string]$result.Properties["name"][0]).$DomainName"
            } else {
                ""
            }

            if (-not [string]::IsNullOrWhiteSpace($dnsHostName)) {
                $entries.Add([pscustomobject]@{
                    HostName = $dnsHostName.Trim()
                    IPv4Address = ""
                })
            }
        }

        return $entries
    } catch {
        throw "Failed to enumerate domain computer objects: $($_.Exception.Message)"
    }
}

function Resolve-HostToIPv4Addresses {
    param([string]$HostName)

    $resolvedIps = New-Object System.Collections.Generic.List[string]

    if (Get-Command Resolve-DnsName -ErrorAction SilentlyContinue) {
        try {
            $dnsResults = Resolve-DnsName -Name $HostName -Type A -ErrorAction Stop
            foreach ($result in $dnsResults) {
                if (-not [string]::IsNullOrWhiteSpace($result.IPAddress)) {
                    $resolvedIps.Add($result.IPAddress)
                }
            }
        } catch {
        }
    }

    if ($resolvedIps.Count -eq 0) {
        try {
            foreach ($address in [System.Net.Dns]::GetHostAddresses($HostName)) {
                if ($address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
                    $resolvedIps.Add($address.IPAddressToString)
                }
            }
        } catch {
        }
    }

    return $resolvedIps |
        Where-Object { $_ -and $_ -notlike "127.*" -and $_ -ne "0.0.0.0" } |
        Sort-Object -Unique
}

function Get-DomainComputerIpAddresses {
    param([string]$DomainName)

    $computerEntries = Get-DomainComputerEntries -DomainName $DomainName
    if (-not $computerEntries -or $computerEntries.Count -eq 0) {
        throw "No enabled computer objects were found in Active Directory."
    }

    $ipAddresses = New-Object System.Collections.Generic.List[string]
    $unresolvedCount = 0

    foreach ($entry in $computerEntries) {
        if (-not [string]::IsNullOrWhiteSpace($entry.IPv4Address)) {
            $ipAddresses.Add($entry.IPv4Address.Trim())
            continue
        }

        $resolvedForHost = Resolve-HostToIPv4Addresses -HostName $entry.HostName
        if ($resolvedForHost -and $resolvedForHost.Count -gt 0) {
            foreach ($ip in $resolvedForHost) {
                $ipAddresses.Add($ip)
            }
        } else {
            $unresolvedCount++
        }
    }

    $uniqueAddresses = $ipAddresses |
        Where-Object { $_ -and $_ -match '^\d{1,3}(\.\d{1,3}){3}$' } |
        Sort-Object -Unique

    if (-not $uniqueAddresses -or $uniqueAddresses.Count -eq 0) {
        throw "No IPv4 addresses could be resolved for enabled domain computer objects."
    }

    if ($unresolvedCount -gt 0) {
        Write-Warn "Skipped $unresolvedCount domain computer object(s) that could not be resolved to IPv4 addresses."
    }

    return $uniqueAddresses
}

function Get-DomainFirewallScope {
    try {
        $computerSystem = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
        if (-not $computerSystem.PartOfDomain) {
            Write-Warn "Machine is not joined to an Active Directory domain."
            return $null
        }

        if ($computerSystem.DomainRole -notin 4, 5) {
            Write-Warn "Automatic firewall rule creation assumes WinStride is installed on the domain controller."
            return $null
        }

        $domainProfiles = Get-NetConnectionProfile -ErrorAction Stop |
            Where-Object { $_.NetworkCategory -eq "DomainAuthenticated" }

        if (-not $domainProfiles) {
            Write-Warn "No active DomainAuthenticated network profile was detected."
            return $null
        }

        $aliases = $domainProfiles.InterfaceAlias | Sort-Object -Unique
        if ($aliases) {
            Write-Info "Domain-authenticated network detected on: $($aliases -join ', ')"
        }

        $remoteAddresses = Get-DomainComputerIpAddresses -DomainName $computerSystem.Domain.Trim()
        Write-Info "Resolved $($remoteAddresses.Count) domain computer IPv4 address(es) from Active Directory."

        return @{
            Profile = "Domain"
            RemoteAddresses = $remoteAddresses
            DomainName = $computerSystem.Domain.Trim()
        }
    } catch {
        Write-Warn "Failed to detect domain firewall scope automatically: $($_.Exception.Message)"
        return $null
    }
}

function Set-WinStrideFirewallRules {
    param(
        [int[]]$Ports,
        [hashtable]$FirewallScope
    )

    $uniquePorts = $Ports | Sort-Object -Unique
    $remoteAddresses = $FirewallScope.RemoteAddresses | Sort-Object -Unique
    if (-not $remoteAddresses -or $remoteAddresses.Count -eq 0) {
        throw "Remote address list is empty."
    }

    foreach ($port in $uniquePorts) {
        $ruleName = "WinStride API TCP $port"
        $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if ($existingRule) {
            $existingRule | Remove-NetFirewallRule -ErrorAction Stop
        }

        New-NetFirewallRule `
            -DisplayName $ruleName `
            -Direction Inbound `
            -Action Allow `
            -Enabled True `
            -Profile $FirewallScope.Profile `
            -Protocol TCP `
            -LocalPort $port `
            -RemoteAddress $remoteAddresses `
            -Description "Allow WinStride API from Active Directory computer IPs." `
            -ErrorAction Stop | Out-Null

        Write-Ok "Created firewall rule '$ruleName' for $($remoteAddresses.Count) domain computer IP(s)"
    }
}

function Write-ManualFirewallCommands {
    param([int[]]$Ports)

    Write-Info "Use one of the following commands with the exact allowed domain member IPs or CIDRs:"
    foreach ($port in ($Ports | Sort-Object -Unique)) {
        Write-Host "       New-NetFirewallRule -DisplayName 'WinStride API TCP $port' -Direction Inbound -Action Allow -Enabled True -Profile Domain -Protocol TCP -LocalPort $port -RemoteAddress '10.0.0.10,10.0.0.11,10.0.1.0/24'" -ForegroundColor White
        Write-Host "       Get-NetFirewallRule -DisplayName 'WinStride API TCP $port' | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress @('10.0.0.10','10.0.0.11','10.0.1.0/24')" -ForegroundColor White
    }
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

# -- Optional firewall setup --

$portConfig = Get-ApiPortConfig -AppSettingsPath $apiAppSettings
$portsToOpen = @($portConfig.HttpPort)

if ($portConfig.TlsEnabled -and $portConfig.HttpsPort -ne $portConfig.HttpPort) {
    $portsToOpen += $portConfig.HttpsPort
}

$portSummary = ($portsToOpen | Sort-Object -Unique) -join ", "
if (Request-UserConsent "    Open Windows Firewall for WinStride API port(s): $portSummary for domain clients only?") {
    Write-Step "Preparing Windows Firewall configuration"

    $firewallScope = Get-DomainFirewallScope
    if ($null -eq $firewallScope) {
        Write-Warn "Automatic firewall rule creation was skipped."
        Write-Warn "A domain-member-only allow rule needs an explicit IP/CIDR allow list in this setup."
        Write-ManualFirewallCommands -Ports $portsToOpen
    } else {
        try {
            Set-WinStrideFirewallRules -Ports $portsToOpen -FirewallScope $firewallScope
            Write-Ok "Windows Firewall rules created from Active Directory computer IPs."
        } catch {
            Write-Warn "Automatic firewall rule creation failed: $($_.Exception.Message)"
            Write-ManualFirewallCommands -Ports $portsToOpen
        }
    }
} else {
    Write-Info "Skipping Windows Firewall changes."
}

# -- Summary --

Write-Host "`n" -NoNewline
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  WINSTRIDE SETUP COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Prerequisites installed. Database is SQLite (zero config)." -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. (Optional) Run TLS setup:" -ForegroundColor Yellow
Write-Host "       powershell -ExecutionPolicy Bypass -File .\scripts\setup-certs.ps1 -CAName `"YourCA`"" -ForegroundColor White
Write-Host ""
Write-Host "    2. Install/update and start the API + agent services:" -ForegroundColor Yellow
Write-Host "       powershell -ExecutionPolicy Bypass -File .\scripts\start-winstride.ps1" -ForegroundColor White
Write-Host ""
Write-Host "       Developer mode still exists if you want dotnet run windows:" -ForegroundColor Gray
Write-Host "       powershell -ExecutionPolicy Bypass -File .\scripts\start-winstride.ps1 -DevMode" -ForegroundColor White
Write-Host ""
Write-Host "    3. Agent-only install on another Windows machine:" -ForegroundColor Yellow
Write-Host "       powershell -ExecutionPolicy Bypass -File .\scripts\install-run-agent.ps1" -ForegroundColor White
Write-Host "       Domain-joined agents assume WinStride is on the domain controller." -ForegroundColor Gray
Write-Host "       If that is not true, rerun with -ServerAddress '<api-hostname-or-ip>'." -ForegroundColor Gray
Write-Host ""
Write-Host "  The start script now publishes repo-based service runtimes under deploy\services." -ForegroundColor Gray
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
