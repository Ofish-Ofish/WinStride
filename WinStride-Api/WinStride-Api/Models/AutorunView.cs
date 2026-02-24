using Newtonsoft.Json;
using System;
using System.ComponentModel.DataAnnotations;

namespace WinStrideApi.Models
{
    public class AutorunView
    {
        [Key]
        public int Id { get; set; }

        [JsonProperty("time")]
        public DateTime Time { get; set; }

        [JsonProperty("entryLocation")]
        public string EntryLocation { get; set; }

        [JsonProperty("entry")]
        public string Entry { get; set; }

        [JsonProperty("enabled")]
        public string Enabled { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("profile")]
        public string Profile { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("company")]
        public string Company { get; set; }

        [JsonProperty("imagePath")]
        public string ImagePath { get; set; }

        [JsonProperty("version")]
        public string Version { get; set; }

        [JsonProperty("launchString")]
        public string LaunchString { get; set; }

        [JsonProperty("md5")]
        public string Md5 { get; set; }

        [JsonProperty("sha1")]
        public string Sha1 { get; set; }

        [JsonProperty("pesha1")]
        public string PeSha1 { get; set; }

        [JsonProperty("pesha256")]
        public string PeSha256 { get; set; }

        [JsonProperty("sha256")]
        public string Sha256 { get; set; }

        [JsonProperty("imp")]
        public string Imp { get; set; }

        [JsonProperty("batchId")]
        public Guid BatchId { get; set; }

        [JsonProperty("machineName")]
        public string MachineName { get; set; }

        [JsonProperty("timeSynced")]
        public DateTimeOffset TimeSynced { get; set; }
    }
}