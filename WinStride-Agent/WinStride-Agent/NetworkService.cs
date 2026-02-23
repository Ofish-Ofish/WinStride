using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Management.Automation;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Management.Automation;
using System.Collections.ObjectModel;
using WinStrideApi.Models;
using Newtonsoft.Json;

namespace WinStrideAgent.Services
{
    public class NetworkService
    {
        private readonly string _baseUrl;
        private readonly HttpClient _httpClient;
        private readonly string _machineName;

        public NetworkService(string baseUrl, HttpClient httpClient)
        {
            _baseUrl = baseUrl;
            _httpClient = httpClient;
            _machineName = Environment.MachineName;
        }

        public async Task SyncNetworkData(Guid batchId)
        {
            List<TCPView> currentConnections = GetNetworkSnapshot();

            foreach (TCPView conn in currentConnections)
            {
                conn.BatchId = batchId;
                conn.MachineName = _machineName;
                conn.TimeCreated = DateTimeOffset.UtcNow;
            }

            try
            {
                string endpoint;
                if (_baseUrl.EndsWith("/Event", StringComparison.OrdinalIgnoreCase))
                {
                    endpoint = _baseUrl.Substring(0, _baseUrl.LastIndexOf("/Event", StringComparison.OrdinalIgnoreCase)) + "/network/sync";
                }
                else
                {
                    endpoint = $"{_baseUrl.TrimEnd('/')}/network/sync";
                }

                Logger.WriteLine($"[Network] Target Endpoint: {endpoint}");

                string json = JsonConvert.SerializeObject(currentConnections);
                StringContent content = new StringContent(json, Encoding.UTF8, "application/json");

                HttpResponseMessage response = await _httpClient.PostAsync(endpoint, content);
                
                if (response.IsSuccessStatusCode)
                {
                    Logger.WriteLine($"[Network] Successfully synced {currentConnections.Count} connections.");
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[Network] Sync failed: {ex.Message}");
            }
        }

        private List<TCPView> GetNetworkSnapshot()
        {
            List<TCPView> snapshots = new List<TCPView>();

            try
            {
                using (PowerShell ps = PowerShell.Create())
                {
                    ps.AddScript("Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force");
                    ps.AddScript("Import-Module NetTCPIP -ErrorAction SilentlyContinue");

                    ps.AddScript(@"
                Get-NetTCPConnection -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess;
                Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, @{Name='RemoteAddress';Expression={'*'}}, @{Name='RemotePort';Expression={'0'}}, @{Name='State';Expression={'Listen'}}, OwningProcess
            ");

                    Collection<PSObject> results = ps.Invoke();

                    if (results.Count == 0)
                    {
                        Logger.WriteLine("[Network] PowerShell returned 0 results. Ensure Agent is 'Run as Administrator'.");
                        return snapshots;
                    }

                    foreach (PSObject result in results)
                    {
                        try
                        {
                            int pid = Convert.ToInt32(result.Properties["OwningProcess"].Value);
                            Process process = GetProcessSafe(pid);

                            string localAddr = result.Properties["LocalAddress"].Value?.ToString() ?? "";
                            string remoteAddr = result.Properties["RemoteAddress"].Value?.ToString() ?? "";

                            string protocolLabel = result.ToString().Contains("TCP") ? "TCP" : "UDP";
                            protocolLabel += (localAddr.Contains(":") || remoteAddr.Contains(":")) ? "v6" : "v4";

                            TCPView connection = new TCPView
                            {
                                LocalAddress = localAddr,
                                LocalPort = Convert.ToInt32(result.Properties["LocalPort"].Value),
                                RemoteAddress = remoteAddr,
                                RemotePort = (remoteAddr == "*" || string.IsNullOrEmpty(remoteAddr)) ? 0 : Convert.ToInt32(result.Properties["RemotePort"].Value),
                                State = result.Properties["State"].Value?.ToString() ?? "Unknown",
                                Protocol = protocolLabel,
                                ProcessId = pid,
                                ProcessName = process?.ProcessName ?? "Unknown"
                            };

                            if (process != null)
                            {
                                try
                                {
                                    connection.ModuleName = process.MainModule?.FileName ?? "System Process";

                                    connection.SentBytes = process.VirtualMemorySize64;
                                    connection.RecvBytes = process.WorkingSet64;
                                }
                                catch
                                {
                                    connection.ModuleName = "N/A";
                                }
                            }

                            snapshots.Add(connection);
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"[Network] Skipping connection row due to error: {ex.Message}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[Network] Fatal error in GetNetworkSnapshot: {ex.Message}");
            }

            return snapshots;
        }

        private Process GetProcessSafe(int pid)
        {
            try { return Process.GetProcessById(pid); }
            catch { return null; }
        }
    }
}