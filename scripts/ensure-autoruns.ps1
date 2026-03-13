function Ensure-AutorunsBinary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetDirectory
    )

    $destinationPath = Join-Path $TargetDirectory "autorunsc.exe"
    if (Test-Path $destinationPath) {
        Write-Host "    [OK] Autoruns CLI already present: $destinationPath" -ForegroundColor Green
        return $true
    }

    if (-not (Test-Path $TargetDirectory)) {
        New-Item -ItemType Directory -Path $TargetDirectory -Force | Out-Null
    }

    $existingBinary = Resolve-ExistingAutorunsBinary
    if (-not [string]::IsNullOrWhiteSpace($existingBinary)) {
        Copy-Item $existingBinary $destinationPath -Force
        Write-Host "    [OK] Reused existing Autoruns CLI: $existingBinary" -ForegroundColor Green
        return $true
    }

    Write-Host "`n[*] Downloading Sysinternals Autoruns CLI" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("winstride-autoruns-" + [Guid]::NewGuid().ToString("N"))
    $zipPath = Join-Path $tempRoot "Autoruns.zip"
    $extractDir = Join-Path $tempRoot "extract"

    try {
        New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

        $oldProgressPreference = $ProgressPreference
        $ProgressPreference = "SilentlyContinue"
        try {
            Invoke-WebRequestCompat -Uri "https://download.sysinternals.com/files/Autoruns.zip" -OutFile $zipPath
        } finally {
            $ProgressPreference = $oldProgressPreference
        }

        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

        $preferredBinaryName = if ([Environment]::Is64BitOperatingSystem) { "Autorunsc64.exe" } else { "Autorunsc.exe" }
        $candidatePaths = @(
            (Join-Path $extractDir $preferredBinaryName),
            (Join-Path $extractDir "Autorunsc.exe"),
            (Join-Path $extractDir "Autorunsc64.exe")
        ) | Select-Object -Unique

        $archiveBinary = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
        if (-not $archiveBinary) {
            throw "Autoruns.zip did not contain Autorunsc.exe or Autorunsc64.exe."
        }

        Copy-Item $archiveBinary $destinationPath -Force
        Write-Host "    [OK] Downloaded Autoruns CLI to: $destinationPath" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "    [!] Failed to stage autorunsc.exe automatically: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    } finally {
        Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Resolve-ExistingAutorunsBinary {
    $commandNames = if ([Environment]::Is64BitOperatingSystem) {
        @("autorunsc64.exe", "autorunsc.exe")
    } else {
        @("autorunsc.exe", "autorunsc64.exe")
    }

    foreach ($commandName in $commandNames) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $command) {
            continue
        }

        $candidatePath = $command.Source
        if ([string]::IsNullOrWhiteSpace($candidatePath)) {
            $candidatePath = $command.Path
        }
        if ([string]::IsNullOrWhiteSpace($candidatePath)) {
            $candidatePath = $command.Definition
        }

        if (-not [string]::IsNullOrWhiteSpace($candidatePath) -and (Test-Path $candidatePath)) {
            return $candidatePath
        }
    }

    return $null
}

function Invoke-WebRequestCompat {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [string]$OutFile
    )

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    if ($PSVersionTable.PSVersion.Major -lt 6) {
        Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -ErrorAction Stop
        return
    }

    Invoke-WebRequest -Uri $Uri -OutFile $OutFile -ErrorAction Stop
}
