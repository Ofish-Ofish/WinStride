using System.ComponentModel.DataAnnotations;

namespace WinStrideApi.Models
{
    public class Heartbeat
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string MachineName { get; set; } = string.Empty;

        public bool IsAlive { get; set; } = true;

        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
    }
}