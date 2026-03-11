using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
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
            Logger.WriteLine($"[Network] Sync starting for Batch: {batchId}");

            List<TCPView> currentConnections = GetNetworkSnapshot();

            if (currentConnections.Count == 0)
            {
                Logger.WriteLine("[Network] Warning: Snapshot returned 0 connections. Skipping upload.");
                return;
            }

            Logger.WriteLine($"[Network] Preparing to upload {currentConnections.Count} connections...");

            foreach (TCPView conn in currentConnections)
            {
                conn.BatchId = batchId;
                conn.MachineName = _machineName;
                conn.TimeCreated = DateTime.UtcNow;
            }

            try
            {
                string endpoint = _baseUrl.Replace("/api/Event", "/api/network/sync");
                string json = JsonConvert.SerializeObject(currentConnections);
                StringContent content = new StringContent(json, Encoding.UTF8, "application/json");

                Logger.WriteLine($"[Network] POSTing to {endpoint} (Payload size: {json.Length / 1024} KB)");

                HttpResponseMessage response = await _httpClient.PostAsync(endpoint, content);

                if (response.IsSuccessStatusCode)
                {
                    Logger.WriteLine($"[Network] Success! API accepted {currentConnections.Count} rows.");
                }
                else
                {
                    string errorDetails = await response.Content.ReadAsStringAsync();
                    Logger.WriteLine($"[Network] API Error ({response.StatusCode}): {errorDetails}");
                }
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"[Network] Critical Upload Exception: {ex.Message}");
            }
        }

        private List<TCPView> GetNetworkSnapshot()
        {
            var snapshots = new List<TCPView>();

            try { snapshots.AddRange(GetTcp4Connections()); } catch (Exception ex) { Logger.WriteLine($"[Network] Error in TCP4: {ex.Message}"); }
            try { snapshots.AddRange(GetTcp6Connections()); } catch (Exception ex) { Logger.WriteLine($"[Network] Error in TCP6: {ex.Message}"); }
            try { snapshots.AddRange(GetUdp4Connections()); } catch (Exception ex) { Logger.WriteLine($"[Network] Error in UDP4: {ex.Message}"); }
            try { snapshots.AddRange(GetUdp6Connections()); } catch (Exception ex) { Logger.WriteLine($"[Network] Error in UDP6: {ex.Message}"); }

            Logger.WriteLine($"[Network] Snapshot complete. Total Found: {snapshots.Count}");
            return snapshots;
        }

        #region IPv4 Retrieval

        private List<TCPView> GetTcp4Connections()
        {
            var results = new List<TCPView>();
            int bufferSize = 0;

            IpHelper.GetExtendedTcpTable(IntPtr.Zero, ref bufferSize, true, IpHelper.AF_INET, IpHelper.TcpTableClass.TCP_TABLE_OWNER_PID_ALL);

            IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
            try
            {
                uint result = IpHelper.GetExtendedTcpTable(buffer, ref bufferSize, true, IpHelper.AF_INET, IpHelper.TcpTableClass.TCP_TABLE_OWNER_PID_ALL);
                if (result != 0)
                {
                    Logger.WriteLine($"[Network] TCPv4 Table Error Code: {result}");
                    return results;
                }

                int rowCount = Marshal.ReadInt32(buffer);
                IntPtr rowPtr = (IntPtr)((long)buffer + 4);

                for (int i = 0; i < rowCount; i++)
                {
                    var row = Marshal.PtrToStructure<IpHelper.MIB_TCPROW_OWNER_PID>(rowPtr);
                    var proc = GetProcessSafe((int)row.owningPid);
                    results.Add(CreateTcpViewItem("TCPv4", IpHelper.GetIpAddress(row.localAddr), IpHelper.GetPort(row.localPort),
                        IpHelper.GetIpAddress(row.remoteAddr), IpHelper.GetPort(row.remotePort), IpHelper.GetTcpState(row.state), (int)row.owningPid, proc));
                    rowPtr = (IntPtr)((long)rowPtr + Marshal.SizeOf(typeof(IpHelper.MIB_TCPROW_OWNER_PID)));
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
            return results;
        }

        private List<TCPView> GetUdp4Connections()
        {
            var results = new List<TCPView>();
            int bufferSize = 0;
            IpHelper.GetExtendedUdpTable(IntPtr.Zero, ref bufferSize, true, IpHelper.AF_INET, IpHelper.UdpTableClass.UDP_TABLE_OWNER_PID);

            IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
            try
            {
                uint result = IpHelper.GetExtendedUdpTable(buffer, ref bufferSize, true, IpHelper.AF_INET, IpHelper.UdpTableClass.UDP_TABLE_OWNER_PID);
                if (result == 0)
                {
                    int rowCount = Marshal.ReadInt32(buffer);
                    IntPtr rowPtr = (IntPtr)((long)buffer + 4);
                    for (int i = 0; i < rowCount; i++)
                    {
                        var row = Marshal.PtrToStructure<IpHelper.MIB_UDPROW_OWNER_PID>(rowPtr);
                        var proc = GetProcessSafe((int)row.owningPid);
                        results.Add(CreateTcpViewItem("UDPv4", IpHelper.GetIpAddress(row.localAddr), IpHelper.GetPort(row.localPort), "*", 0, "Listen", (int)row.owningPid, proc));
                        rowPtr = (IntPtr)((long)rowPtr + Marshal.SizeOf(typeof(IpHelper.MIB_UDPROW_OWNER_PID)));
                    }
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
            return results;
        }

        #endregion

        #region IPv6 Retrieval

        private List<TCPView> GetTcp6Connections()
        {
            var results = new List<TCPView>();
            int bufferSize = 0;
            IpHelper.GetExtendedTcpTable(IntPtr.Zero, ref bufferSize, true, IpHelper.AF_INET6, IpHelper.TcpTableClass.TCP_TABLE_OWNER_PID_ALL);

            IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
            try
            {
                uint result = IpHelper.GetExtendedTcpTable(buffer, ref bufferSize, true, IpHelper.AF_INET6, IpHelper.TcpTableClass.TCP_TABLE_OWNER_PID_ALL);
                if (result == 0)
                {
                    int rowCount = Marshal.ReadInt32(buffer);
                    IntPtr rowPtr = (IntPtr)((long)buffer + 4);
                    for (int i = 0; i < rowCount; i++)
                    {
                        var row = Marshal.PtrToStructure<IpHelper.MIB_TCP6ROW_OWNER_PID>(rowPtr);
                        var proc = GetProcessSafe((int)row.owningPid);
                        results.Add(CreateTcpViewItem("TCPv6", IpHelper.GetIp6Address(row.localAddr), IpHelper.GetPort(row.localPort),
                            IpHelper.GetIp6Address(row.remoteAddr), IpHelper.GetPort(row.remotePort), IpHelper.GetTcpState(row.state), (int)row.owningPid, proc));
                        rowPtr = (IntPtr)((long)rowPtr + Marshal.SizeOf(typeof(IpHelper.MIB_TCP6ROW_OWNER_PID)));
                    }
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
            return results;
        }

        private List<TCPView> GetUdp6Connections()
        {
            var results = new List<TCPView>();
            int bufferSize = 0;
            IpHelper.GetExtendedUdpTable(IntPtr.Zero, ref bufferSize, true, IpHelper.AF_INET6, IpHelper.UdpTableClass.UDP_TABLE_OWNER_PID);

            IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
            try
            {
                uint result = IpHelper.GetExtendedUdpTable(buffer, ref bufferSize, true, IpHelper.AF_INET6, IpHelper.UdpTableClass.UDP_TABLE_OWNER_PID);
                if (result == 0)
                {
                    int rowCount = Marshal.ReadInt32(buffer);
                    IntPtr rowPtr = (IntPtr)((long)buffer + 4);
                    for (int i = 0; i < rowCount; i++)
                    {
                        var row = Marshal.PtrToStructure<IpHelper.MIB_UDP6ROW_OWNER_PID>(rowPtr);
                        var proc = GetProcessSafe((int)row.owningPid);
                        results.Add(CreateTcpViewItem("UDPv6", IpHelper.GetIp6Address(row.localAddr), IpHelper.GetPort(row.localPort), "*", 0, "Listen", (int)row.owningPid, proc));
                        rowPtr = (IntPtr)((long)rowPtr + Marshal.SizeOf(typeof(IpHelper.MIB_UDP6ROW_OWNER_PID)));
                    }
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
            return results;
        }

        #endregion

        #region Helpers

        private TCPView CreateTcpViewItem(string proto, string localIp, int localPort, string remoteIp, int remotePort, string state, int pid, Process proc)
        {
            return new TCPView
            {
                Protocol = proto,
                LocalAddress = localIp,
                LocalPort = localPort,
                RemoteAddress = remoteIp,
                RemotePort = remotePort,
                State = state,
                ProcessId = pid,
                ProcessName = proc?.ProcessName ?? "Unknown",
                ModuleName = GetModuleSafe(proc)
            };
        }

        private Process GetProcessSafe(int pid)
        {
            try { return Process.GetProcessById(pid); }
            catch { return null; }
        }

        private string GetModuleSafe(Process p)
        {
            if (p == null) return "N/A";
            try { return p.MainModule?.FileName ?? "System Process"; }
            catch { return "Access Denied"; }
        }

        #endregion
    }
}