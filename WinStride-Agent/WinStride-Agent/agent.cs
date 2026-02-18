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

        List<Task> monitorTasks = new List<Task>();


        foreach (KeyValuePair<string, LogConfig> logEntry in fullConfig.Logs)
        {
            if (!logEntry.Value.Enabled) continue;

            try
            {
                LogMonitor monitor = new LogMonitor(logEntry.Key, logEntry.Value, client, BaseUrl);
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

    public LogMonitor(string logName, LogConfig config, HttpClient client, string baseUrl)
    {
        _logName = logName;
        _config = config ?? new LogConfig();
        _client = client;
        _baseUrl = baseUrl;
        _machineName = Environment.MachineName;
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

    private string BuildXPathQuery(DateTime? since = null)
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

        DateTime? effectiveSince = since;

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

    private async Task SyncBacklogAsync(DateTime? since)
    {
        string queryText = BuildXPathQuery(since);
        EventLogQuery query = new EventLogQuery(_logName, PathType.LogName, queryText);

        try
        {
            using (EventLogReader reader = new EventLogReader(query))
            {
                EventLogRecord? record;
                int count = 0;
                while ((record = (EventLogRecord)reader.ReadEvent()) != null)
                {
                    using (record)
                    {
                        WinEvent logData = MapRecordToModel(record);

                        bool success = await PostLogToApi(logData);
                        if (!success)
                        {
                            await StopAndRecover();
                            return;
                        }
                        count++;
                    }
                }
                Console.WriteLine($"[{_logName}] Backlog sync complete. {count} logs uploaded.");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{_logName}] Sync error: {ex.Message}");
        }
    }

    private void StartLiveWatcher()
    {
        string queryText = BuildXPathQuery(null);
        EventLogQuery query = new EventLogQuery(_logName, PathType.LogName, queryText);
        _watcher = new EventLogWatcher(query);

        _watcher.EventRecordWritten += async delegate (object? sender, EventRecordWrittenEventArgs arg)
        {
            if (arg.EventRecord != null && !_isRecovering)
            {
                try
                {
                    using (EventLogRecord record = (EventLogRecord)arg.EventRecord)
                    {
                        WinEvent logData = MapRecordToModel(record);
                        bool success = await PostLogToApi(logData);

                        if(!success)
                        {
                            _ = StopAndRecover();
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[{_logName}] Live watch error: {ex.Message}");
                }
            }
        };

        _watcher.Enabled = true;
        Console.WriteLine($"[{_logName}] Live watcher is now enabled.");
    }

    public async Task<WinEvent?> GetLastLogFromApi()
    {
        try
        {
            string requestUrl = $"{_baseUrl}?machineName={Uri.EscapeDataString(_machineName)}&logName={Uri.EscapeDataString(_logName)}";
            HttpResponseMessage response = await _client.GetAsync(requestUrl);

            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                List<WinEvent>? logs = System.Text.Json.JsonSerializer.Deserialize<List<WinEvent>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return logs?.FirstOrDefault();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{_logName}] Error fetching last log: {ex.Message}");
        }
        return null;
    }

    private async Task<bool> PostLogToApi(WinEvent data)
    {
        try
        {
            string json = System.Text.Json.JsonSerializer.Serialize(data);
            StringContent content = new StringContent(json, Encoding.UTF8, "application/json");
            HttpResponseMessage response = await _client.PostAsync(_baseUrl, content);
            
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{_logName}] Error posting log: {ex.Message}");
            return false;
        }
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
            TimeCreated = record.TimeCreated?.ToUniversalTime() ?? DateTime.UtcNow,
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
}