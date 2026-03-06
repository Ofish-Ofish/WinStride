using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace WinStride_Api.Models
{
    public class WinProcess
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string MachineName { get; set; }

        [Required]
        public Guid BatchId { get; set; }

        public DateTime TimeSynced { get; set; } = DateTime.UtcNow;

        public string ImageName { get; set; }

        public int Pid { get; set; }

        public int? ParentPid { get; set; }

        public int SessionId { get; set; }

        public long WorkingSetSize { get; set; }
    }
}
