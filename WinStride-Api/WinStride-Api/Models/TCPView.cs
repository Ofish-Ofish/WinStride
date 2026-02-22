using System;
using Newtonsoft.Json;

namespace WinStrideApi.Models
{
    public class TCPView
    {
        public int Id { get; set; }

        public string MachineName { get; set; } = string.Empty;

        [JsonProperty("processName")]
        public string? ProcessName { get; set; }

        [JsonProperty("processId")]
        public int? ProcessId { get; set; }

        [JsonProperty("batchId")]
        public Guid BatchId { get; set; }

        [JsonProperty("protocol")]
        public string? Protocol { get; set; }

        [JsonProperty("localAddress")]
        public string? LocalAddress { get; set; }

        [JsonProperty("localPort")]
        public int? LocalPort { get; set; }

        [JsonProperty("remoteAddress")]
        public string? RemoteAddress { get; set; }

        [JsonProperty("remotePort")]
        public int? RemotePort { get; set; }

        [JsonProperty("state")]
        public string? State { get; set; }

        [JsonProperty("moduleName")]
        public string? ModuleName { get; set; }

        [JsonProperty("sentPackets")]
        public long SentPackets { get; set; } = 0;

        [JsonProperty("recvPackets")]
        public long RecvPackets { get; set; } = 0;

        [JsonProperty("sentBytes")]
        public long SentBytes { get; set; } = 0;

        [JsonProperty("recvBytes")]
        public long RecvBytes { get; set; } = 0;

        [JsonProperty("timeCreated")]
        public DateTimeOffset TimeCreated { get; set; } = DateTimeOffset.UtcNow;
    }
}