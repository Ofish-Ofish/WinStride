using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using CsvHelper;
using CsvHelper.Configuration;
using Newtonsoft.Json;
using WinStrideApi.Models;

namespace WinStrideAgent.Services
{
    public class AutorunService
    {
        private readonly string _baseUrl;
        private readonly HttpClient _httpClient;
        private readonly string _machineName;

        public AutorunService(string baseUrl, HttpClient httpClient)
        {
            _baseUrl = baseUrl;
            _httpClient = httpClient;
            _machineName = Environment.MachineName;
        }

        public async Task SyncAutorunData(Guid batchId)
        {
            List<AutorunView> currentAutoruns = GetAutorunSnapshot();

            if (currentAutoruns == null || currentAutoruns.Count == 0)
            {
                Logger.WriteLine("[Autorun] No data collected. Skipping sync.");
                return;
            }

            foreach (AutorunView item in currentAutoruns)
            {
                item.BatchId = batchId;
                item.MachineName = _machineName;
                item.TimeSynced = DateTimeOffset.UtcNow;
            }

            try
            {
                string endpoint;
                if (_baseUrl.EndsWith("/Event", StringComparison.OrdinalIgnoreCase))
                {
                    endpoint = _baseUrl.Substring(0, _baseUrl.LastIndexOf("/Event", StringComparison.OrdinalIgnoreCase)) + "/autoruns/sync";
                }
                else
                {
                    endpoint = $"{_baseUrl.TrimEnd('/')}/autoruns/sync";
                }

                Logger.WriteLine($"[Autorun] Target Endpoint: {endpoint}");

                // Debug: verify the first item is no longer null
                Logger.WriteLine($"[DEBUG] Sample Entry: {currentAutoruns[0].Entry} (Time: {currentAutoruns[0].Time})");

                string json = JsonConvert.SerializeObject(currentAutoruns);
                StringContent content = new StringContent(json, Encoding.UTF8, "application/json");

                HttpResponseMessage response = await _httpClient.PostAsync(endpoint, content);

                if (response.IsSuccessStatusCode)
                {
                    Logger.WriteLine($"[Autorun] Successfully synced {currentAutoruns.Count} entries.");
                }
                else
                {
                    string errorDetails = await response.Content.ReadAsStringAsync();
                    Logger.WriteLine($"[Autorun] Sync failed: {response.StatusCode} - {errorDetails}");
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[Autorun] Sync failed: {ex.Message}");
            }
        }

        private List<AutorunView> GetAutorunSnapshot()
        {
            List<AutorunView> snapshots = new List<AutorunView>();

            // Look for binary in Binaries subfolder or root
            string binaryPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Binaries", "autorunsc.exe");
            if (!File.Exists(binaryPath))
            {
                binaryPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "autorunsc.exe");
            }

            if (!File.Exists(binaryPath))
            {
                Logger.WriteLine($"[Autorun] ERROR: autorunsc.exe not found at {binaryPath}");
                return snapshots;
            }

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = binaryPath,
                    Arguments = "-a * -c -h -s -m -accepteula",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8
                };

                using (Process process = Process.Start(startInfo))
                {
                    using (StreamReader reader = process.StandardOutput)
                    {
                        string rawOutput = reader.ReadToEnd();
                        if (string.IsNullOrWhiteSpace(rawOutput)) return snapshots;

                        using (StringReader sr = new StringReader(rawOutput))
                        {
                            string line;
                            while ((line = sr.ReadLine()) != null)
                            {
                                if (line.StartsWith("Time") || line.Contains("Entry Location"))
                                {
                                    var config = new CsvConfiguration(CultureInfo.InvariantCulture)
                                    {
                                        HasHeaderRecord = true,
                                        HeaderValidated = null,
                                        MissingFieldFound = null,
                                        PrepareHeaderForMatch = args => args.Header.Replace(" ", "").Replace("-", "")
                                    };

                                    string remainingData = line + Environment.NewLine + sr.ReadToEnd();
                                    using (var subReader = new StringReader(remainingData))
                                    using (var csv = new CsvReader(subReader, config))
                                    {
                                        csv.Context.RegisterClassMap<AutorunMap>();
                                        snapshots = csv.GetRecords<AutorunView>().ToList();
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    process.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[Autorun] Parser Error: {ex.Message}");
            }

            return snapshots;
        }
    }

    public sealed class AutorunMap : ClassMap<AutorunView>
    {
        public AutorunMap()
        {
            AutoMap(CultureInfo.InvariantCulture);

            Map(m => m.Time).Convert(args =>
            {
                string rawValue = args.Row.GetField("Time");
                DateTime finalDate;

                if (string.IsNullOrWhiteSpace(rawValue) || rawValue.Equals("n/a", StringComparison.OrdinalIgnoreCase))
                {
                    finalDate = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                }
                else if (DateTime.TryParse(rawValue, out DateTime parsed))
                {
                    finalDate = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
                }
                else
                {
                    finalDate = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                }

                return finalDate;
            });

            Map(m => m.Verified).Convert(args => {
                string val = args.Row.GetField("Verified");
                return (string.IsNullOrWhiteSpace(val) || val == "n/a") ? "Unverified" : val;
            });

            Map(m => m.Sha256).Convert(args => {
                string val = args.Row.GetField("SHA-256");
                return (string.IsNullOrWhiteSpace(val) || val == "n/a") ? string.Empty : val;
            });
        }
    }
}