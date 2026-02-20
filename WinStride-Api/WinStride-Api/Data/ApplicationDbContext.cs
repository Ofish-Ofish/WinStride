using Microsoft.EntityFrameworkCore;
using WinStrideApi.Models;

namespace WinStrideApi.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }
        public DbSet<WinEvent> WinEvents { get; set; }
        public DbSet<Heartbeat> Heartbeats { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<WinEvent>(entity =>
            {
                entity.HasIndex(e => new { e.LogName, e.TimeCreated })
                      .IsDescending(false, true);

                entity.HasIndex(e => e.EventId);

                entity.HasIndex(e => e.TimeCreated)
                      .IsDescending(true);
            });
        }
    }
}