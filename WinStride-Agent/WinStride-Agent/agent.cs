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

        EventLogQuery query = new EventLogQuery("Security", PathType.LogName, "*");
        query.ReverseDirection = true;

        using (EventLogReader reader = new EventLogReader(query))
        {

            using (EventLogRecord record = (EventLogRecord)reader.ReadEvent())
            {
                if (record != null)
                {
                    WinEvent logData = MapRecordToModel(record);
                    await PostLogToApi(logData);
                }
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
                Console.WriteLine("System Status: Healthy.");
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

            Console.WriteLine("Posting most recent log");
            HttpResponseMessage response = await client.PostAsync(BaseUrl, content);

            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine("Successfully synced with PostgreSQL.");
            }
            else
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