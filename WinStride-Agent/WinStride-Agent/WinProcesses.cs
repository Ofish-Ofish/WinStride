using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using WinStride_Api.Models;
using WinStrideApi.Models;

namespace WinStrideAgent.Services
{
    public class WinProcessService
    {
        private readonly string _baseUrl;
        private readonly HttpClient _httpClient;
        private readonly string _machineName;

        public WinProcessService(string baseUrl, HttpClient httpClient)
        {
            _baseUrl = baseUrl;
            _httpClient = httpClient;
            _machineName = Environment.MachineName;
        }

        public async Task SyncProcessData(Guid agentBatchId)
        {
            List<WinProcess> currentProcesses = GetWinProcessesSnapshot();

            foreach (WinProcess proc in currentProcesses)
            {
                proc.MachineName = _machineName;
            }

            try
            {
                string endpoint;
                if (_baseUrl.EndsWith("/Event", StringComparison.OrdinalIgnoreCase))
                {
                    endpoint = _baseUrl.Substring(0, _baseUrl.LastIndexOf("/Event", StringComparison.OrdinalIgnoreCase)) + "/processes/sync";
                }
                else
                {
                    endpoint = $"{_baseUrl.TrimEnd('/')}/api/processes/sync";
                }

                Logger.WriteLine($"[WinProcesses] Syncing to: {endpoint}");

                string json = JsonConvert.SerializeObject(currentProcesses);
                StringContent content = new StringContent(json, Encoding.UTF8, "application/json");

                HttpResponseMessage response = await _httpClient.PostAsync(endpoint, content);

                if (response.IsSuccessStatusCode)
                {
                    string result = await response.Content.ReadAsStringAsync();
                    Logger.WriteLine($"[WinProcesses] Sync Success: {result}");
                }
                else
                {
                    string error = await response.Content.ReadAsStringAsync();
                    Logger.WriteLine($"[WinProcesses] Sync Failed ({response.StatusCode}): {error}");
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[WinProcesses] Connection Error: {ex.Message}");
            }
        }

        private List<WinProcess> GetWinProcessesSnapshot()
        {
            List<WinProcess> snapshots = new List<WinProcess>();

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = "wmic.exe",
                    Arguments = "process get Name,ProcessId,ParentProcessId,SessionId,WorkingSetSize /FORMAT:CSV",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8
                };

                using (Process process = Process.Start(startInfo))
                {
                    using (StreamReader reader = process.StandardOutput)
                    {
                        string headerLine = reader.ReadLine();
                        while (headerLine != null && !headerLine.Contains("Node"))
                        {
                            headerLine = reader.ReadLine();
                        }

                        while (!reader.EndOfStream)
                        {
                            string line = reader.ReadLine();
                            if (string.IsNullOrWhiteSpace(line)) continue;

                            string[] parts = line.Split(',');
                            if (parts.Length < 6) continue;

                            try
                            {
                                WinProcess wp = new WinProcess
                                {
                                    ImageName = parts[1].Trim(),
                                    ParentPid = int.TryParse(parts[2], out int ppid) ? ppid : 0,
                                    Pid = int.TryParse(parts[3], out int pid) ? pid : 0,
                                    SessionId = int.TryParse(parts[4], out int sid) ? sid : 0,
                                    WorkingSetSize = long.TryParse(parts[5], out long mem) ? mem : 0
                                };

                                snapshots.Add(wp);
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"[WinProcesses] Row Parse Error: {ex.Message}");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[WinProcesses] Capture Error: {ex.Message}");
            }

            return snapshots;
        }
    }
}