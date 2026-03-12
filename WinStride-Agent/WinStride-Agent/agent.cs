using Newtonsoft.Json;
using System.Diagnostics.Eventing.Reader;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using WinStrideAgent.Services;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;

class Program
{
    static async Task Main(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);

        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "WinStrideAgent";
        });

        builder.Services.AddHostedService<AgentWorker>();

        using IHost host = builder.Build();
        await host.RunAsync();
    }
}

public class AgentWorker : BackgroundService
{
    private HttpClient _client = null!;
    private string _baseUrl = null!;
    private AppConfig _config = null!;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            var ex = e.ExceptionObject as Exception;
            Logger.WriteLine($"[FATAL CRASH] Unhandled Exception: {ex?.Message}");
            Logger.WriteLine($"[FATAL CRASH] StackTrace: {ex?.StackTrace}");
        };

        try
        {
            if (!InitializeConfiguration())
            {
                Logger.WriteLine("[FATAL] Configuration failed. Service cannot start.");
                return;
            }

            Logger.WriteLine("\n\n");
            Logger.WriteLine("================================================================");
            Logger.WriteLine("                WinStride Agent Service Running                 ");
            Logger.WriteLine("================================================================");

            List<Task> backgroundTasks = new List<Task>
            {
                StartHeartbeatLoop(stoppingToken),
                StartNetworkLoop(stoppingToken),
                StartAutorunLoop(stoppingToken),
                StartWinProcessLoop(stoppingToken)
            };

            foreach (KeyValuePair<string, LogConfig> logEntry in _config.Logs)
            {
                if (!logEntry.Value.Enabled) continue;

                try
                {
                    LogMonitor monitor = new LogMonitor(
                        logEntry.Key,
                        logEntry.Value,
                        _client,
                        _baseUrl,
                        _config.Global.BatchSize,
                        _config.Global.recoverdelayMs);

                    backgroundTasks.Add(monitor.StartAsync());
                }
                catch (EventLogNotFoundException)
                {
                    Logger.WriteLine($"[Warning] Log path '{logEntry.Key}' not found. Skipping.");
                }
                catch (UnauthorizedAccessException)
                {
                    Logger.WriteLine($"[Error] Access Denied for '{logEntry.Key}'. Service usually runs as LocalSystem.");
                }
            }

            await Task.WhenAll(backgroundTasks);
        }
        catch (OperationCanceledException)
        {
            Logger.WriteLine("[Service] Shutdown requested. Cleaning up...");
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[FATAL CRASH] Main Service Error: {ex.Message}");
            Logger.WriteLine($"[StackTrace] {ex.StackTrace}");
        }
    }

    private bool InitializeConfiguration()
    {
        string baseDir = AppContext.BaseDirectory;
        string configPath = Path.Combine(baseDir, "config.yaml");

        _config = LoadConfig(configPath);

        if (string.IsNullOrWhiteSpace(_config.Global.BaseUrl))
        {
            Logger.WriteLine("[CRITICAL ERROR] 'global.baseUrl' is missing in config.yaml.");
            return false;
        }

        _baseUrl = _config.Global.BaseUrl;
        if (!Uri.TryCreate(_baseUrl, UriKind.Absolute, out Uri? baseUri) ||
            (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps))
        {
            Logger.WriteLine($"[CRITICAL ERROR] 'global.baseUrl' is invalid: {_baseUrl}");
            return false;
        }

        var configuredClient = CreateConfiguredClient(baseUri, _config.Global.CertSubject);
        if (configuredClient is null) return false;

        _client = configuredClient;
        Logger.MaxLogSizeMb = _config.Global.MaxLogSizeMb;

        return true;
    }

    private async Task StartHeartbeatLoop(CancellationToken ct)
    {
        string heartbeatUrl = _baseUrl.Replace("/Event", "/Heartbeat");
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var pulse = new { MachineName = Environment.MachineName, LastSeen = DateTime.UtcNow, IsAlive = true };
                string json = JsonConvert.SerializeObject(pulse, new JsonSerializerSettings
                {
                    ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver()
                });

                var content = new StringContent(json, Encoding.UTF8, "application/json");
                await _client.PostAsync(heartbeatUrl, content, ct);
            }
            catch (Exception ex) when (!(ex is OperationCanceledException))
            {
                Logger.WriteLine($"[Heartbeat] failure: {ex.Message}");
            }
            await Task.Delay(TimeSpan.FromSeconds(_config.Global.HeartbeatInterval), ct);
        }
    }

    private async Task StartNetworkLoop(CancellationToken ct)
    {
        NetworkService networkService = new NetworkService(_baseUrl, _client);
        while (!ct.IsCancellationRequested)
        {
            try { await networkService.SyncNetworkData(Guid.NewGuid()); }
            catch (Exception ex) when (!(ex is OperationCanceledException))
            {
                Logger.WriteLine($"[Network] Error: {ex.Message}");
            }
            await Task.Delay(TimeSpan.FromSeconds(10), ct);
        }
    }

    private async Task StartAutorunLoop(CancellationToken ct)
    {
        AutorunService autorunService = new AutorunService(_baseUrl, _client);
        while (!ct.IsCancellationRequested)
        {
            try { await autorunService.SyncAutorunData(Guid.NewGuid()); }
            catch (Exception ex) when (!(ex is OperationCanceledException))
            {
                Logger.WriteLine($"[Autorun] Error: {ex.Message}");
            }
            await Task.Delay(TimeSpan.FromSeconds(120), ct);
        }
    }

    private async Task StartWinProcessLoop(CancellationToken ct)
    {
        WinProcessService processService = new WinProcessService(_baseUrl, _client);
        while (!ct.IsCancellationRequested)
        {
            try { await processService.SyncProcessData(Guid.NewGuid()); }
            catch (Exception ex) when (!(ex is OperationCanceledException))
            {
                Logger.WriteLine($"[WinProcesses] Error: {ex.Message}");
            }
            await Task.Delay(TimeSpan.FromSeconds(10), ct);
        }
    }

    private AppConfig LoadConfig(string filePath)
    {
        try
        {
            if (!File.Exists(filePath)) return new AppConfig();
            string yamlContent = File.ReadAllText(filePath);
            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(CamelCaseNamingConvention.Instance)
                .Build();
            return deserializer.Deserialize<AppConfig>(yamlContent) ?? new AppConfig();
        }
        catch (Exception ex)
        {
            Logger.WriteLine($"[Error] Failed to parse YAML: {ex.Message}");
            return new AppConfig();
        }
    }

    private HttpClient? CreateConfiguredClient(Uri baseUri, string? certSubject)
    {
        if (!string.Equals(baseUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return new HttpClient();
        }

        if (string.IsNullOrWhiteSpace(certSubject)) return null;

        HttpClientHandler handler = new HttpClientHandler();
        string thumbprint = certSubject.Replace(" ", string.Empty).Trim();

        // Note: For Windows Services running as LocalSystem, use StoreLocation.LocalMachine
        using (X509Store store = new X509Store(StoreName.My, StoreLocation.LocalMachine))
        {
            store.Open(OpenFlags.ReadOnly);
            X509Certificate2Collection certs = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, false);

            if (certs.Count > 0)
            {
                handler.ClientCertificates.Add(certs[0]);
                Logger.WriteLine($"[Auth] Loaded cert: {certs[0].Thumbprint}");
            }
            else
            {
                Logger.WriteLine($"[CRITICAL] Cert NOT FOUND in LocalMachine Store! Thumbprint: {thumbprint}");
                return null;
            }
        }
        return new HttpClient(handler);
    }
}