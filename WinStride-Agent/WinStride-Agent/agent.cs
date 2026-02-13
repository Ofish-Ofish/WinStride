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
            Console.WriteLine("Critial Error: API or Database is unavailable. Terminating session.");
            return;
        }

        string logName = "Security";

        if (!EventLog.Exists(logName))
        {
            Console.WriteLine($"Error: The log '{logName}' does not exist on this system.");
            return;
        }

        string currentMachine = Environment.MachineName;
        WinEvent? lastSavedLog = await GetLastLogFromApi(currentMachine);

        if (lastSavedLog != null)
        {
            await SyncBacklogAsync(lastSavedLog.TimeCreated);
        }
        else
        {
            await SyncBacklogAsync(null);
        }

        EventLogQuery query = new EventLogQuery("Security", PathType.LogName, "*");

        using (EventLogWatcher watcher = new EventLogWatcher(query))
        {
            watcher.EventRecordWritten += new EventHandler<EventRecordWrittenEventArgs>(OnEventWritten);
            watcher.Enabled = true;

            Console.WriteLine("Watcher enabled. Press [Enter] to stop the agent.");
            Console.ReadLine();
        }
    }

    private static async Task SyncBacklogAsync(DateTime? since)
    {
        string queryText;
        if (since.HasValue)
        {
            DateTime startAfter = since.Value.AddTicks(1);
            string xmlTime = startAfter.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ");
            queryText = $"*[System[TimeCreated[@SystemTime > '{xmlTime}']]]";
        }
        else
        {
            queryText = "*";
        }
        
        EventLogQuery query = new EventLogQuery("Security", PathType.LogName, queryText);

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
            Console.WriteLine($"Sync complete. Uploaded {count} historical logs.");
        }
    }

    public static async Task<WinEvent?> GetLastLogFromApi(string machineName)
    {
        try
        {
            string requestUrl = $"{BaseUrl}?machineName={Uri.EscapeDataString(machineName)}";
            HttpResponseMessage response = await client.GetAsync(requestUrl);

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
            Console.WriteLine($"Error fetching last log: {ex.Message}");
        }
        return null;
    }

    private static async void OnEventWritten(object sender, EventRecordWrittenEventArgs arg)
    {
        if (arg.EventRecord != null)
        {
            try
            {
                EventLogRecord record = (EventLogRecord)arg.EventRecord;
                WinEvent logData = MapRecordToModel(record);

                await PostLogToApi(logData);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing real-time event: {ex.Message}");
            }
        }
    }
    private static WinEvent MapRecordToModel(EventLogRecord record)
    {
        string rawXml = record.ToXml();
        XmlDocument doc = new XmlDocument();
        doc.LoadXml(rawXml);
        string jsonFromXml = JsonConvert.SerializeXmlNode(doc);

        return new WinEvent
        {
            EventId = record.Id,
            LogName = record.LogName,
            MachineName = record.MachineName,
            Level = record.LevelDisplayName ?? "Information",
            TimeCreated = record.TimeCreated?.ToUniversalTime() ?? DateTime.UtcNow,
            EventData = jsonFromXml
        };
    }

    static async Task<bool> ApiIsHealthy()
    {
        try
        {
            Console.WriteLine("Checking API health");
            var response = await client.GetAsync($"{BaseUrl}/health");

            if (response.IsSuccessStatusCode)
            {
                //Console.WriteLine("System Status: Healthy.");
                return true;
            }

            Console.WriteLine($"System Status: Unhealthy ({response.StatusCode})");
            return false;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Connection failed: {ex.Message}");
            return false;
        }
    }

    static async Task PostLogToApi(object data)
    {
        try
        {
            string json = System.Text.Json.JsonSerializer.Serialize(data);
            StringContent content = new StringContent(json, Encoding.UTF8, "application/json");

            //Console.WriteLine("Posting most recent log");
            HttpResponseMessage response = await client.PostAsync(BaseUrl, content);

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Post failed: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error during post: {ex.Message}");
        }
    }

}