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
using WinStrideAgent.Utils;

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
                proc.BatchId = agentBatchId;
            }

            try
            {
                string endpoint;
                if (_baseUrl.Contains("/api/Event", StringComparison.OrdinalIgnoreCase))
                {
                    endpoint = _baseUrl.Replace("/api/Event", "/api/processes/sync");
                }
                else
                {
                    endpoint = $"{_baseUrl.TrimEnd('/')}/api/processes/sync";
                }

                Logger.WriteLine($"[WinProcesses] Syncing {currentProcesses.Count} processes to: {endpoint}");

                string json = JsonConvert.SerializeObject(currentProcesses);
                using (StringContent content = new StringContent(json, Encoding.UTF8, "application/json"))
                {
                    HttpResponseMessage response = await _httpClient.PostAsync(endpoint, content);

                    if (response.IsSuccessStatusCode)
                    {
                        Logger.WriteLine($"[WinProcesses] Sync Success (Batch: {agentBatchId})");
                    }
                    else
                    {
                        string error = await response.Content.ReadAsStringAsync();
                        Logger.WriteLine($"[WinProcesses] Sync Failed ({response.StatusCode}): {error}");
                    }
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
                    Arguments = "process get Name,ExecutablePath,ProcessId,ParentProcessId,SessionId,WorkingSetSize /FORMAT:CSV",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8
                };

                using (Process process = Process.Start(startInfo))
                {
                    using (StreamReader reader = process.StandardOutput)
                    {
                        string line;
                        while ((line = reader.ReadLine()) != null)
                        {
                            if (string.IsNullOrWhiteSpace(line) || line.Contains("Node"))
                                continue;

                            string[] parts = line.Split(',');

                            if (parts.Length < 7) continue;

                            try
                            {
                                string filePath = parts[1].Trim();

                                WinProcess wp = new WinProcess
                                {
                                    Path = filePath,
                                    ImageName = parts[2].Trim(),
                                    ParentPid = int.TryParse(parts[3], out int ppid) ? ppid : 0,
                                    Pid = int.TryParse(parts[4], out int pid) ? pid : 0,
                                    SessionId = int.TryParse(parts[5], out int sid) ? sid : 0,
                                    WorkingSetSize = long.TryParse(parts[6], out long mem) ? mem : 0,

                                    VerificationStatus = SigCheck.GetSignatureStatus(filePath)
                                };

                                snapshots.Add(wp);
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"[WinProcesses] Parse error on row: {ex.Message}");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[WinProcesses] WMIC Capture Error: {ex.Message}");
            }

            return snapshots;
        }
    }
}