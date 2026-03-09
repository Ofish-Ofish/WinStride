param(
    [string]$EvtxPath,
    [string]$ApiUrl = "http://localhost:5090/api/Event",
    [int]$BatchSize = 100
)

# If no path given, ingest all .evtx files from kiosk logs folder
$evtxFiles = @()
if ($EvtxPath) {
    $evtxFiles += $EvtxPath
} else {
    $defaultDir = "C:\Users\Irakli\Downloads\kiosk logs"
    if (Test-Path $defaultDir) {
        $evtxFiles = Get-ChildItem -Path $defaultDir -Filter "*.evtx" | ForEach-Object { $_.FullName }
        Write-Host "Found $($evtxFiles.Count) .evtx files in: $defaultDir"
    } else {
        Write-Host "No -EvtxPath specified and default dir not found: $defaultDir" -ForegroundColor Red
        exit 1
    }
}

# Convert XML node to a hashtable that mirrors Newtonsoft's SerializeXmlNode output
function ConvertXmlNode-ToHashtable($node) {
    if ($node -is [System.Xml.XmlText]) {
        return $node.Value
    }

    $result = @{}

    # Add attributes with @ prefix
    foreach ($attr in $node.Attributes) {
        $result["@$($attr.LocalName)"] = $attr.Value
    }

    # Group child elements by name
    $childGroups = @{}
    foreach ($child in $node.ChildNodes) {
        if ($child -is [System.Xml.XmlElement]) {
            $name = $child.LocalName
            if (-not $childGroups.ContainsKey($name)) {
                $childGroups[$name] = @()
            }
            $childGroups[$name] += $child
        } elseif ($child -is [System.Xml.XmlText]) {
            $result["#text"] = $child.Value
        }
    }

    foreach ($name in $childGroups.Keys) {
        $elements = $childGroups[$name]
        if ($elements.Count -gt 1) {
            $arr = @()
            foreach ($el in $elements) {
                $arr += (ConvertXmlNode-ToHashtable $el)
            }
            $result[$name] = $arr
        } else {
            $el = $elements[0]
            $hasChildElements = $false
            foreach ($c in $el.ChildNodes) {
                if ($c -is [System.Xml.XmlElement]) { $hasChildElements = $true; break }
            }
            if (-not $hasChildElements -and $el.Attributes.Count -gt 0 -and $el.InnerText) {
                $obj = @{}
                foreach ($attr in $el.Attributes) {
                    $obj["@$($attr.LocalName)"] = $attr.Value
                }
                $obj["#text"] = $el.InnerText
                $result[$name] = $obj
            } elseif (-not $hasChildElements -and $el.Attributes.Count -eq 0) {
                $result[$name] = $el.InnerText
            } else {
                $result[$name] = (ConvertXmlNode-ToHashtable $el)
            }
        }
    }

    return $result
}

function Send-Batch($batch, $ApiUrl) {
    # Use -InputObject to preserve array structure; pipe flattens nested arrays
    $json = ConvertTo-Json -InputObject @($batch) -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $null = Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $bytes -ContentType "application/json; charset=utf-8" -ErrorAction Stop
}

$totalSuccess = 0
$totalErrors = 0

foreach ($file in $evtxFiles) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "Loading: $file" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    try {
        $events = Get-WinEvent -Path $file -ErrorAction Stop
    } catch {
        Write-Host "Failed to load: $($_.Exception.Message)" -ForegroundColor Red
        $totalErrors++
        continue
    }

    Write-Host "Events: $($events.Count) | Log: $($events[0].LogName) | Machine: $($events[0].MachineName)"
    Write-Host "Time range: $($events[-1].TimeCreated) to $($events[0].TimeCreated)"

    $successCount = 0
    $errorCount = 0
    $total = $events.Count
    $batch = @()

    foreach ($event in $events) {
        $i = $successCount + $errorCount + 1

        $xml = $event.ToXml()
        try {
            $xmlDoc = New-Object System.Xml.XmlDocument
            $xmlDoc.LoadXml($xml)
            $hashtable = ConvertXmlNode-ToHashtable $xmlDoc.DocumentElement
            $jsonFromXml = @{ Event = $hashtable } | ConvertTo-Json -Depth 10 -Compress
        } catch {
            $errorCount++
            if ($errorCount -le 3) {
                Write-Host "XML parse error on event $i : $($_.Exception.Message)" -ForegroundColor Yellow
            }
            continue
        }

        $levelName = switch ($event.Level) {
            0 { "Information" }
            1 { "Critical" }
            2 { "Error" }
            3 { "Warning" }
            4 { "Information" }
            5 { "Verbose" }
            default { "Level $($event.Level)" }
        }
        if ($event.LevelDisplayName) { $levelName = $event.LevelDisplayName }

        $batch += @{
            EventId     = $event.Id
            LogName     = $event.LogName
            MachineName = $event.MachineName
            Level       = $levelName
            TimeCreated = $event.TimeCreated.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ")
            EventData   = $jsonFromXml
        }

        if ($batch.Count -ge $BatchSize) {
            try {
                Send-Batch $batch $ApiUrl
                $successCount += $batch.Count
            } catch {
                $errorCount += $batch.Count
                if ($errorCount -le 3) {
                    Write-Host "Batch error: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
            $batch = @()
        }

        if ($i % 1000 -eq 0 -or $i -eq $total) {
            Write-Host "Progress: $i / $total (success: $successCount, errors: $errorCount)"
        }
    }

    # Send remaining events
    if ($batch.Count -gt 0) {
        try {
            Send-Batch $batch $ApiUrl
            $successCount += $batch.Count
        } catch {
            $errorCount += $batch.Count
            Write-Host "Final batch error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    Write-Host "Done: $successCount ingested, $errorCount errors" -ForegroundColor Green
    $totalSuccess += $successCount
    $totalErrors += $errorCount
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "All files done! Total: $totalSuccess ingested, $totalErrors errors" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
