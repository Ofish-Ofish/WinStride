param(
    [string]$EvtxPath = "C:\Users\Irakli\Downloads\kiosk logs\secuity-kiosk-3.evtx",
    [string]$ApiUrl = "http://localhost:5090/api/Event"
)

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
            # Multiple elements with same name -> array
            $arr = @()
            foreach ($el in $elements) {
                $arr += (ConvertXmlNode-ToHashtable $el)
            }
            $result[$name] = $arr
        } else {
            $el = $elements[0]
            # Check if element has only text content and attributes
            $hasChildElements = $false
            foreach ($c in $el.ChildNodes) {
                if ($c -is [System.Xml.XmlElement]) { $hasChildElements = $true; break }
            }
            if (-not $hasChildElements -and $el.Attributes.Count -gt 0 -and $el.InnerText) {
                # Element with attributes and text -> { @attr: val, #text: val }
                $obj = @{}
                foreach ($attr in $el.Attributes) {
                    $obj["@$($attr.LocalName)"] = $attr.Value
                }
                $obj["#text"] = $el.InnerText
                $result[$name] = $obj
            } elseif (-not $hasChildElements -and $el.Attributes.Count -eq 0) {
                # Simple text element
                $result[$name] = $el.InnerText
            } else {
                $result[$name] = (ConvertXmlNode-ToHashtable $el)
            }
        }
    }

    return $result
}

# Load events from .evtx file
Write-Host "Loading events from: $EvtxPath"
$events = Get-WinEvent -Path $EvtxPath -ErrorAction Stop
Write-Host "Found $($events.Count) events"
Write-Host "Machine: $($events[0].MachineName)"
Write-Host "Time range: $($events[-1].TimeCreated) to $($events[0].TimeCreated)"

$successCount = 0
$errorCount = 0
$total = $events.Count

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
            Write-Host "XML parse error on event $i : $($_.Exception.Message)"
        }
        continue
    }

    # Map level display name
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

    $body = @{
        EventId     = $event.Id
        LogName     = $event.LogName
        MachineName = $event.MachineName
        Level       = $levelName
        TimeCreated = $event.TimeCreated.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ")
        EventData   = $jsonFromXml
    } | ConvertTo-Json -Depth 5 -Compress

    try {
        $null = Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        $successCount++
    } catch {
        $errorCount++
        if ($errorCount -le 3) {
            Write-Host "Error on event $i : $($_.Exception.Message)"
        }
    }

    if ($i % 500 -eq 0 -or $i -eq $total) {
        Write-Host "Progress: $i / $total (success: $successCount, errors: $errorCount)"
    }
}

Write-Host "`nDone! Ingested $successCount events ($errorCount errors)"
