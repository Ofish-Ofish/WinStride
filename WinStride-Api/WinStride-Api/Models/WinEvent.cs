using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;


namespace WinStrideApi.Models
{
    public class WinEvent
    {
        [Key]
        public int Id { get; set; }

        public int EventId { get; set; }

        public string LogName { get; set; } = string.Empty;

        public string MachineName { get; set; } = string.Empty;

        public string? Level { get; set; } = string.Empty;

        [Required]
        public DateTimeOffset TimeCreated { get; set; }

        [Column(TypeName = "jsonb")]
        public string? EventData { get; set; }

    }
}