using System;
using System.Diagnostics;
using System.Diagnostics.Eventing.Reader;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Xml;
using WinStrideApi.Models;
using Newtonsoft.Json;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

class Agent
{
    private static readonly HttpClient client = new HttpClient();

    static async Task Main()
    {
        AppConfig fullConfig = LoadConfig("config.yaml");
        if (string.IsNullOrWhiteSpace(fullConfig.Global.BaseUrl))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("[CRITICAL ERROR] 'global.baseUrl' is missing in config.yaml.");
            Console.WriteLine("The agent cannot start without a target API destination.");
            Console.ResetColor();
            return;
        }

        string BaseUrl = fullConfig.Global.BaseUrl;
        int batchSize = fullConfig.Global.BatchSize;

        _ = StartHeartbeatLoop(BaseUrl, fullConfig.Global.HeartbeatInterval);

        List<Task> monitorTasks = new List<Task>();


        foreach (KeyValuePair<string, LogConfig> logEntry in fullConfig.Logs)
        {
            if (!logEntry.Value.Enabled) continue;

            try
            {
                LogMonitor monitor = new LogMonitor(logEntry.Key, logEntry.Value, client, BaseUrl, batchSize);
                monitorTasks.Add(monitor.StartAsync());
            }
            catch (EventLogNotFoundException)
            {
                Console.WriteLine($"[Warning] Log path '{logEntry.Key}' not found. Skipping.");
            }
            catch (UnauthorizedAccessException)
            {
                Console.WriteLine($"[Error] Access Denied for '{logEntry.Key}'. Please run as Administrator.");
            }
        }

        if (monitorTasks.Count == 0)
        {
            Console.WriteLine("No valid logs to monitor. Press [Enter] to exit.");
            Console.ReadLine();
            return;
        }

        await Task.WhenAll(monitorTasks);
        Console.WriteLine("\nAll monitors are active. Press [Enter] to terminate the agent.");
        Console.ReadLine();
    }
    private static AppConfig LoadConfig(string filePath)
    {
        try
        {
            if (!File.Exists(filePath))
            {
                return new AppConfig();
            }

            string yamlContent = File.ReadAllText(filePath);
            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(CamelCaseNamingConvention.Instance)
                .Build();

            var config = deserializer.Deserialize<AppConfig>(yamlContent);
            return config ?? new AppConfig();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Error] Failed to parse YAML: {ex.Message}");
            return new AppConfig();
        }
    }

    private static async Task StartHeartbeatLoop(string baseUrl, int intervalSeconds)
    {
        string heartbeatUrl = baseUrl.Replace("/Event", "/Heartbeat");

        while (true)
        {
            try
            {
                Heartbeat pulse = new Heartbeat
                {
                    MachineName = Environment.MachineName,
                    LastSeen = DateTime.UtcNow,
                    IsAlive = true
                };

                var settings = new JsonSerializerSettings
                {
                    ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver()
                };

                string json = JsonConvert.SerializeObject(pulse, settings);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                HttpResponseMessage response = await client.PostAsync(heartbeatUrl, content);

                if (!response.IsSuccessStatusCode)
                {
                    string error = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[Heartbeat] Warning: {response.StatusCode} - {error}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Heartbeat] Network failure: {ex.Message}");
            }

            await Task.Delay(TimeSpan.FromSeconds(intervalSeconds));
        }
    }
}

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

    public LogMonitor(string logName, LogConfig config, HttpClient client, string baseUrl, int batchSize)
    {
        _logName = logName;
        _config = config ?? new LogConfig();
        _client = client;
        _baseUrl = baseUrl;
        _machineName = Environment.MachineName;
        _batchSize = batchSize;
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
            Console.WriteLine($"[{_logName}] Critical error in live watcher: {ex.Message}");
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
                Console.WriteLine($"[{_logName}] Uploaded {data.Count} logs.");
                return true;
            }

            string errorBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"[{_logName}] Error: {response.StatusCode} - {errorBody}");

            return false;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{_logName}] Network failure: {ex.Message}");
            return false;
        }
    }

    public async Task StartAsync()
    {
        WinEvent? lastSavedLog = await GetLastLogFromApi();
        await SyncBacklogAsync(lastSavedLog?.TimeCreated);
        StartLiveWatcher();
    }

    private async Task<bool> ApiIsHealthy()
    {
        try
        {
            Console.WriteLine("Checking API health...");
            HttpResponseMessage response = await _client.GetAsync($"{_baseUrl}/health");
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Connection failed: {ex.Message}");
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

        Console.WriteLine($"Connection lost. Watcher stopped. Entering Recovery Mode");

        while (_isRecovering)
        {
            _isRecovering = !(await ApiIsHealthy());
            if(_isRecovering)
            {
                await Task.Delay(30000);
            }
        }

        Console.WriteLine($"Resuming operations");
        await StartAsync();
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
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"[{_logName}] Warning: Log not found on this system. Skipping.");
            Console.ResetColor();
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
            Console.WriteLine($"[{_logName}] Live watcher enabled.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{_logName}] Failed to start watcher: {ex.Message}");
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
            Console.WriteLine($"[{_logName}] Error fetching last log: {ex.Message}");
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

public class LogConfig
{
    public bool Enabled { get; set; } = true;
    public string MinLevel { get; set; } = "Verbose";
    public List<int> IncludeIds { get; set; } = new List<int>();
    public List<int> ExcludeIds { get; set; } = new List<int>();
    public int? MaxBacklogDays { get; set; } = null;
}

public class AppConfig
{
    public GlobalSettings Global { get; set; } = new GlobalSettings();
    public Dictionary<string, LogConfig> Logs { get; set; } = new Dictionary<string, LogConfig>();
}

public class GlobalSettings
{
    public string? BaseUrl { get; set; } = null;
    public int BatchSize { get; set; } = 100;

    public int HeartbeatInterval { get; set; } = 60;
}

public class ODataResponse<T>
{
    [System.Text.Json.Serialization.JsonPropertyName("value")]
    public List<T>? Value { get; set; }
}
public class Heartbeat
{
    public int Id { get; set; }
    public string MachineName { get; set; } = string.Empty;
    public bool IsAlive { get; set; }
    public DateTime LastSeen { get; set; }
}