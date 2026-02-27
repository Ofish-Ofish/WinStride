using System.Diagnostics.Eventing.Reader;
using System.Text;
using System.Xml;
using Newtonsoft.Json;
using WinStrideApi.Models;
using System.Text.Json;

public class LogMonitor
{
    private readonly string _logName;
    private readonly LogConfig _config;
    private readonly HttpClient _client;
    private readonly string _baseUrl;
    private readonly string _machineName;
    private EventLogWatcher? _watcher;
    private bool _isRecovering = false;

    private List<WinEvent> _liveBuffer = new List<WinEvent>();
    private readonly object _lock = new object();
    private DateTime _lastUploadTime = DateTime.Now;
    private readonly int _batchSize;
    private readonly int _recoverDelayMs;

    private long _lastSeenRecordId = 0;
    private long? _pendingWatchdogRecordId = null;
    private bool _watchdogStarted = false;

    public LogMonitor(string logName, LogConfig config, HttpClient client, string baseUrl, int batchSize, int recoverDelayMs)
    {
        _logName = logName;
        _config = config ?? new LogConfig();
        _client = client;
        _baseUrl = baseUrl;
        _machineName = Environment.MachineName;
        _batchSize = batchSize;
        _recoverDelayMs = recoverDelayMs;
    }

    private void OnEventWritten(object? sender, EventRecordWrittenEventArgs e)
    {
        if (e.EventRecord == null || _isRecovering) return;

        try
        {
            using (EventLogRecord record = (EventLogRecord)e.EventRecord)
            {
                WinEvent logData = MapRecordToModel(record);

                lock (_lock)
                {
                    if (record.RecordId.HasValue && record.RecordId.Value > _lastSeenRecordId)
                    {
                        _lastSeenRecordId = record.RecordId.Value;
                    }

                    _liveBuffer.Add(logData);
                    double secondsSinceLast = (DateTime.Now - _lastUploadTime).TotalSeconds;

                    if (_liveBuffer.Count >= _batchSize || secondsSinceLast > 5)
                    {
                        var batchToSend = new List<WinEvent>(_liveBuffer);
                        _liveBuffer.Clear();
                        _lastUploadTime = DateTime.Now;
                        Task.Run(async () =>
                        {
                            bool success = await PostBatchToApi(batchToSend);
                            if (!success)
                            {
                                _ = StopAndRecover();
                            }
                        });
                    }
                }
            }   
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[{_logName}] Critical error in live watcher: {ex.Message}");
        }
    }
    private async Task<bool> PostBatchToApi(List<WinEvent> data)
    {
        if (data == null || data.Count == 0) return true;

        try
        {
            var settings = new JsonSerializerSettings
            {
                ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver(),
                DateFormatString = "yyyy-MM-ddTHH:mm:ss.fffZ",
                ReferenceLoopHandling = ReferenceLoopHandling.Ignore
            };

            string json = JsonConvert.SerializeObject(data, settings);

            var content = new StringContent(json, Encoding.UTF8, "application/json");

            HttpResponseMessage response = await _client.PostAsync($"{_baseUrl}/batch", content);

            if (response.IsSuccessStatusCode)
            {
                Logger.WriteLine($"[{_logName}] Uploaded {data.Count} logs.");
                return true;
            }

            string errorBody = await response.Content.ReadAsStringAsync();
            Logger.WriteLine($"[{_logName}] Error: {response.StatusCode} - {errorBody}");

            if (response.StatusCode == System.Net.HttpStatusCode.BadRequest || 
                response.StatusCode == System.Net.HttpStatusCode.UnprocessableEntity ||
                response.StatusCode == System.Net.HttpStatusCode.RequestEntityTooLarge)
            {
                Logger.WriteLine($"[{_logName}] Rejected by API. Dead-lettering {data.Count} events to prevent pipeline blockage.");
                await WriteToDeadLetterAsync(json);
                return true;
            }

            return false;
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[{_logName}] Network failure: {ex.Message}");
            return false;
        }
    }

    private async Task WriteToDeadLetterAsync(string payload)
    {
        try
        {
            string dlDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "DeadLetter");
            Directory.CreateDirectory(dlDirectory);
            string filePath = Path.Combine(dlDirectory, $"dl_{_logName}_{DateTime.Now:yyyyMMdd_HHmmss}_{Guid.NewGuid().ToString().Substring(0, 8)}.json");
            await File.WriteAllTextAsync(filePath, payload);
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[{_logName}] Failed to write to dead-letter queue: {ex.Message}");
        }
    }

    public async Task StartAsync()
    {
        WinEvent? lastSavedLog = await GetLastLogFromApi();
        await SyncBacklogAsync(lastSavedLog?.TimeCreated);
        StartLiveWatcher();

        if (!_watchdogStarted)
        {
            _watchdogStarted = true;
            _ = WatchdogLoop();
        }
    }

    private async Task<bool> ApiIsHealthy()
    {
        try
        {
            Logger.WriteLine("Checking API health...");
            HttpResponseMessage response = await _client.GetAsync($"{_baseUrl}/health");
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"Connection failed: {ex.Message}");
            return false;
        }
    }

    private async Task StopAndRecover()
    {
        if (_isRecovering) return;
        _isRecovering = true;

        if (_watcher != null)
        {
            _watcher.Enabled = false;
            _watcher.Dispose();
            _watcher = null;
        }

        Logger.WriteLine($"[{_logName}] Connection lost. Watcher stopped. Entering Recovery Mode");

        int backoffDelayMs = _recoverDelayMs;
        int maxBackoffMs = backoffDelayMs * 10;

        while (_isRecovering)
        {
            _isRecovering = !(await ApiIsHealthy());
            if(_isRecovering)
            {
                await Task.Delay(backoffDelayMs);
                backoffDelayMs = Math.Min(backoffDelayMs * 2, maxBackoffMs);
            }
        }

        Logger.WriteLine($"[{_logName}] Resuming operations");
        await StartAsync();
    }

    private async Task WatchdogLoop()
    {
        while (true)
        {
            await Task.Delay(TimeSpan.FromMinutes(5));

            if (_isRecovering || _watcher == null) continue;

            try
            {
                string queryText = BuildXPathQuery(null);
                EventLogQuery query = new EventLogQuery(_logName, PathType.LogName, queryText) { ReverseDirection = true };
                
                using (EventLogReader reader = new EventLogReader(query))
                {
                    using (EventRecord latestRecord = reader.ReadEvent())
                    {
                        if (latestRecord != null && latestRecord.RecordId.HasValue)
                        {
                            long latestId = latestRecord.RecordId.Value;

                            if (latestId < _lastSeenRecordId)
                            {
                                _lastSeenRecordId = 0;
                                _pendingWatchdogRecordId = null;
                            }
                            else if (latestId > _lastSeenRecordId)
                            {
                                if (_pendingWatchdogRecordId.HasValue && latestId >= _pendingWatchdogRecordId.Value)
                                {
                                    Logger.WriteLine($"[{_logName}] Watchdog: Watcher stalled! Stuck at {_lastSeenRecordId}, missing up to {latestId}. Restarting...");
                                    _pendingWatchdogRecordId = null;
                                    _ = StopAndRecover();
                                }
                                else
                                {
                                    _pendingWatchdogRecordId = latestId;
                                }
                            }
                            else
                            {
                                _pendingWatchdogRecordId = null;
                            }
                        }
                    }
                }
            }
            catch (EventLogNotFoundException) { }
            catch (Exception ex)
            {
                Logger.WriteLine($"[{_logName}] Watchdog error: {ex.Message}. Restarting monitor...");
                _pendingWatchdogRecordId = null;
                _ = StopAndRecover();
            }
        }
    }

    private string BuildXPathQuery(DateTimeOffset? since = null)
    {
        List<string> conditions = new List<string>();

        int levelId = _config.MinLevel.ToLower() switch
        {
            "critical" => 1,
            "error" => 2,
            "warning" => 3,
            "information" => 4,
            _ => 5 
        };

        if (levelId < 5)
        {
            conditions.Add($"Level <= {levelId}");
        }

        DateTimeOffset? effectiveSince = since;

        if (_config.MaxBacklogDays.HasValue)
        {
            DateTime earliestAllowed = DateTime.UtcNow.AddDays(-_config.MaxBacklogDays.Value);
            if (!effectiveSince.HasValue || effectiveSince < earliestAllowed)
            {
                effectiveSince = earliestAllowed;
            }
        }
        if (effectiveSince.HasValue)
        {
            string xmlTime = effectiveSince.Value.AddTicks(1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ");
            conditions.Add($"TimeCreated[@SystemTime > '{xmlTime}']");
        }
        if (_config.IncludeIds != null && _config.IncludeIds.Count > 0)
        {
            string includes = string.Join(" or ", _config.IncludeIds.Select(id => $"EventID={id}"));
            conditions.Add($"({includes})");
        }
        if (_config.ExcludeIds != null && _config.ExcludeIds.Count > 0)
        {
            string excludes = string.Join(" and ", _config.ExcludeIds.Select(id => $"EventID!={id}"));
            conditions.Add($"({excludes})");
        }
        if (conditions.Count == 0) return "*";

        return $"*[System[{string.Join(" and ", conditions)}]]";
    }

    private async Task SyncBacklogAsync(DateTimeOffset? since)
    {
        try
        {
            string queryText = BuildXPathQuery(since);
            EventLogQuery query = new EventLogQuery(_logName, PathType.LogName, queryText);

            using (EventLogReader reader = new EventLogReader(query))
            {
                List<WinEvent> batch = new List<WinEvent>();
                EventLogRecord? record;

                while ((record = (EventLogRecord)reader.ReadEvent()) != null)
                {
                    using (record)
                    {
                        if (record.RecordId.HasValue && record.RecordId.Value > _lastSeenRecordId)
                        {
                            _lastSeenRecordId = record.RecordId.Value;
                        }

                        batch.Add(MapRecordToModel(record));
                    }

                    if (batch.Count >= _batchSize)
                    {
                        bool success = await PostBatchToApi(batch);
                        if (!success) { await StopAndRecover(); return; }
                        batch.Clear();
                    }
                }

                if (batch.Count > 0) await PostBatchToApi(batch);
            }
        }
        catch (EventLogNotFoundException)
        {
            Logger.WriteLine($"[{_logName}] Warning: Log not found on this system. Skipping.");
        }
    }

    private void StartLiveWatcher()
    {
        try
        {
            string queryText = BuildXPathQuery(null);
            EventLogQuery query = new EventLogQuery(_logName, PathType.LogName, queryText);

            _watcher = new EventLogWatcher(query);

            _watcher.EventRecordWritten += OnEventWritten;

            _watcher.Enabled = true;
            Logger.WriteLine($"[{_logName}] Live watcher enabled.");
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[{_logName}] Failed to start watcher: {ex.Message}");
            _ = StopAndRecover();
        }
    }

    public async Task<WinEvent?> GetLastLogFromApi()
    {
        try
        {
            string filter = $"machineName eq '{_machineName}' and logName eq '{_logName}'";
            string requestUrl = $"{_baseUrl}?$filter={Uri.EscapeDataString(filter)}&$orderby=timeCreated desc&$top=1";

            HttpResponseMessage response = await _client.GetAsync(requestUrl);

            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();

                var odataResponse = System.Text.Json.JsonSerializer.Deserialize<ODataResponse<WinEvent>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                return odataResponse?.Value?.FirstOrDefault();
            }
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[{_logName}] Error fetching last log: {ex.Message}");
        }
        return null;
    }

    private WinEvent MapRecordToModel(EventLogRecord record)
    {
        XmlDocument doc = new XmlDocument();
        doc.LoadXml(record.ToXml());
        string jsonFromXml = JsonConvert.SerializeXmlNode(doc);

        return new WinEvent
        {
            EventId = record.Id,
            LogName = record.LogName,
            MachineName = record.MachineName,
            Level = record.LevelDisplayName ?? $"Level {record.Level}",
            TimeCreated = record.TimeCreated.HasValue
                ? new DateTimeOffset(record.TimeCreated.Value.ToUniversalTime())
                : DateTimeOffset.UtcNow,
            EventData = jsonFromXml
        };
    }
}