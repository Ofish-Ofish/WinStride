using System;
using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using WinStrideApi.Models;

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

        EventLog eventLog = new EventLog(logName);

        if (eventLog.Entries.Count <= 0)
        {
            Console.WriteLine($"The {logName} log is empty.");
            return;
        }

        EventLogEntry lastEntry = eventLog.Entries[^1];

        WinEvent logData = new WinEvent
        {
            EventId = (int)lastEntry.InstanceId,
            LogName = logName,
            MachineName = lastEntry.MachineName,
            Level = lastEntry.EntryType.ToString(),
            TimeCreated = lastEntry.TimeGenerated.ToUniversalTime(),
            EventData = JsonSerializer.Serialize(new { message = lastEntry.Message })
        };

        await PostLogToApi(logData);


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
            string json = JsonSerializer.Serialize(data);
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