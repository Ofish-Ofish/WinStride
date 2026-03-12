#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Legacy HTTPS wrapper for install-run-agent.ps1.
    Keeps the old parameter names, but installs the WinStride agent as a Windows service.

.PARAMETER PfxPath
    Path to the client certificate .pfx file.

.PARAMETER PfxPassword
    Password for the .pfx file. If not provided, the script will prompt securely.

.PARAMETER ServerIP
    IP address or hostname of the WinStride API server.
    If omitted, the installer assumes the WinStride API is running on the
    Active Directory domain controller for this machine's domain.

.PARAMETER ServerPort
    Port the API is listening on. Defaults to 7097.

.PARAMETER NoStart
    Install/update the service, but do not start it.

.EXAMPLE
    .\setup-agent.ps1 -PfxPath ".\WinStride-Agent.pfx" -ServerIP "192.168.1.10"

.EXAMPLE
    .\setup-agent.ps1 -PfxPath ".\WinStride-Agent.pfx"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$PfxPath,

    [SecureString]$PfxPassword,

    [string]$ServerIP = "",

    [int]$ServerPort = 7097,

    [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installerScript = Join-Path $PSScriptRoot "install-run-agent.ps1"
if (-not (Test-Path $installerScript)) {
    Write-Error "install-run-agent.ps1 was not found next to this script."
    exit 1
}

$forwardParams = @{
    ServerPort = $ServerPort
    UseHttps = $true
    PfxPath = $PfxPath
    NoStart = $NoStart
}

if (-not [string]::IsNullOrWhiteSpace($ServerIP)) {
    $forwardParams.ServerAddress = $ServerIP
}

if ($PSBoundParameters.ContainsKey("PfxPassword")) {
    $forwardParams.PfxPassword = $PfxPassword
}

& $installerScript @forwardParams
