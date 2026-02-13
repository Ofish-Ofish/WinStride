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

class Agent
{
    private static readonly HttpClient client = new HttpClient();
    private const string BaseUrl = "http://localhost:5090/api/Event";

    static async Task Main()
    {
        if (!await ApiIsHealthy())
        {
            Console.WriteLine("Critical Error: API or Database is unavailable. Terminating session.");
            return;
        }

        List<string> logsToMonitor = new List<string>
        {
            "Security",
            "Microsoft-Windows-PowerShell/Operational",
            "Microsoft-Windows-Sysmon/Operational"
        };

        List<Task> monitorTasks = new List<Task>();


        foreach (string logPath in logsToMonitor)
        {
            try
            {
                EventLogConfiguration logConfig = new EventLogConfiguration(logPath);

                LogMonitor monitor = new LogMonitor(logPath, client, BaseUrl);
                monitorTasks.Add(monitor.StartAsync());
            }
            catch (EventLogNotFoundException)
            {
                Console.WriteLine($"[Warning] Log path '{logPath}' not found. Skipping.");
            }
            catch (UnauthorizedAccessException)
            {
                Console.WriteLine($"[Error] Access Denied for '{logPath}'. Please run as Administrator.");
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

    static async Task<bool> ApiIsHealthy()
    {
        try
        {
            Console.WriteLine("Checking API health...");
            HttpResponseMessage response = await client.GetAsync($"{BaseUrl}/health");
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Connection failed: {ex.Message}");
            return false;
        }
    }
}

public class LogMonitor
{
    private readonly string _logName;
    private readonly HttpClient _client;
    private readonly string _baseUrl;
    private readonly string _machineName;

    public LogMonitor(string logName, HttpClient client, string baseUrl)
    {
        _logName = logName;
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

    private async Task SyncBacklogAsync(DateTime? since)
    {
        string queryText;
        if (since.HasValue)
        {
            string xmlTime = since.Value.AddTicks(1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ");
            queryText = $"*[System[TimeCreated[@SystemTime > '{xmlTime}']]]";
        }
        else
        {
            queryText = "*";
        }

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
                        await PostLogToApi(logData);
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
        EventLogQuery query = new EventLogQuery(_logName, PathType.LogName, "*");
        EventLogWatcher watcher = new EventLogWatcher(query);

        watcher.EventRecordWritten += async (object? sender, EventRecordWrittenEventArgs arg) =>
        {
            if (arg.EventRecord != null)
            {
                try
                {
                    using (EventLogRecord record = (EventLogRecord)arg.EventRecord)
                    {
                        WinEvent logData = MapRecordToModel(record);
                        await PostLogToApi(logData);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[{_logName}] Live watch error: {ex.Message}");
                }
            }
        };

        watcher.Enabled = true;
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

    private async Task PostLogToApi(WinEvent data)
    {
        try
        {
            string json = System.Text.Json.JsonSerializer.Serialize(data);
            StringContent content = new StringContent(json, Encoding.UTF8, "application/json");
            HttpResponseMessage response = await _client.PostAsync(_baseUrl, content);

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[{_logName}] Post failed: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{_logName}] Error posting log: {ex.Message}");
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