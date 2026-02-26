using System.Diagnostics.Eventing.Reader;
using System.Text;
using Newtonsoft.Json;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using WinStrideAgent.Services;
class Agent
{
    private static readonly HttpClient client = new HttpClient();

    static async Task Main()
    {
        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            var ex = e.ExceptionObject as Exception;
            Logger.WriteLine($"[FATAL CRASH] Unhandled AppDomain Exception: {ex?.Message}");
            Logger.WriteLine($"[FATAL CRASH] StackTrace: {ex?.StackTrace}");
            Logger.WriteLine("[FATAL CRASH] --- DEATH CERTIFICATE --- Agent Process Terminated.");
        };

        TaskScheduler.UnobservedTaskException += (sender, e) =>
        {
            Logger.WriteLine($"[FATAL CRASH] Unobserved Task Exception: {e.Exception.Message}");
            Logger.WriteLine($"[FATAL CRASH] StackTrace: {e.Exception.StackTrace}");
            Logger.WriteLine("[FATAL CRASH] --- DEATH CERTIFICATE --- Background Task Terminated.");
            e.SetObserved();
        };

        try
        {
            string projectRoot = GetSourceDirectory();
            string configPath = Path.Combine(projectRoot, "config.yaml");
            AppConfig fullConfig = LoadConfig(configPath);

            if (string.IsNullOrWhiteSpace(fullConfig.Global.BaseUrl))
            {
                Logger.WriteLine("[CRITICAL ERROR] 'global.baseUrl' is missing in config.yaml.");
                Logger.WriteLine("The agent cannot start without a target API destination.");
                return;
            }

            string BaseUrl = fullConfig.Global.BaseUrl;
            int batchSize = fullConfig.Global.BatchSize;
            Logger.MaxLogSizeMb = fullConfig.Global.MaxLogSizeMb;

            Logger.WriteLine("\n\n\n");
            Logger.WriteLine("================================================================");
            Logger.WriteLine("                    WinStride Agent Started                     ");
            Logger.WriteLine("================================================================");

            int startDelaySeconds = 30;

            await Task.Delay(TimeSpan.FromSeconds(startDelaySeconds));

            _ = StartHeartbeatLoop(BaseUrl, fullConfig.Global.HeartbeatInterval);

            _ = Task.Run(async () =>
            {
                try
                {
                    Logger.WriteLine("[Network] Background loop starting...");
                    NetworkService networkService = new NetworkService(BaseUrl, client);
                    while (true)
                    {
                        Guid pulseId = Guid.NewGuid();
                        await networkService.SyncNetworkData(pulseId);
                        await Task.Delay(TimeSpan.FromSeconds(10));
                    }
                }
                catch (Exception ex)
                {
                    Logger.WriteLine($"[FATAL] Network Loop crashed: {ex.Message}");
                }
            });

            _ = Task.Run(async () =>
            {
                try
                {
                    Logger.WriteLine("[Autorun] Background loop starting...");
                    AutorunService autorunService = new AutorunService(BaseUrl, client);

                    while (true)
                    {
                        Guid pulseId = Guid.NewGuid();

                        Logger.WriteLine($"[Autorun] Starting scan (Pulse: {pulseId})");
                        await autorunService.SyncAutorunData(pulseId);

                        await Task.Delay(TimeSpan.FromSeconds(120));
                    }
                }
                catch (Exception ex)
                {
                    Logger.WriteLine($"[FATAL] Autorun Loop crashed: {ex.Message}");
                }
            });


            List<Task> monitorTasks = new List<Task>();

            foreach (KeyValuePair<string, LogConfig> logEntry in fullConfig.Logs)
            {
                if (!logEntry.Value.Enabled) continue;

                try
                {
                    LogMonitor monitor = new LogMonitor(logEntry.Key, logEntry.Value, client, BaseUrl, batchSize, fullConfig.Global.recoverdelayMs);
                    monitorTasks.Add(monitor.StartAsync());
                }
                catch (EventLogNotFoundException)
                {
                    Logger.WriteLine($"[Warning] Log path '{logEntry.Key}' not found. Skipping.");
                }
                catch (UnauthorizedAccessException)
                {
                    Logger.WriteLine($"[Error] Access Denied for '{logEntry.Key}'. Please run as Administrator.");
                }
            }

            if (monitorTasks.Count == 0)
            {
                Logger.WriteLine("No valid logs to monitor. Exiting.");
                return;
            }

            await Task.WhenAll(monitorTasks);
            Logger.WriteLine("All monitors are active.");
            await Task.Delay(-1);
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[FATAL CRASH] Main thread exception: {ex.Message}");
            Logger.WriteLine($"[FATAL CRASH] StackTrace: {ex.StackTrace}");
            Logger.WriteLine("[FATAL CRASH] --- DEATH CERTIFICATE --- Agent Process Terminated.");
        }
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
            Logger.WriteLine($"[Error] Failed to parse YAML: {ex.Message}");
            return new AppConfig();
        }

    }

    private static string GetSourceDirectory([System.Runtime.CompilerServices.CallerFilePath] string sourceFilePath = "")
    {
        return System.IO.Path.GetDirectoryName(sourceFilePath) ?? string.Empty;
    }

    private static string GetConfigPath()
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string productionPath = Path.Combine(appDir, "config.yaml");
        if (File.Exists(productionPath)) return productionPath;
        return Path.Combine(GetSourceDirectory(), "config.yaml");
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
                    Logger.WriteLine($"[Heartbeat] Warning: {response.StatusCode} - {error}");
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[Heartbeat] Network failure: {ex.Message}");
            }

            await Task.Delay(TimeSpan.FromSeconds(intervalSeconds));
        }
    }
}