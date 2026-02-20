using Microsoft.EntityFrameworkCore;
using WinStrideApi.Models; // This assumes your WinEvent class is in the Models folder

namespace WinStrideApi.Data
{
    public class ApplicationDbContext : DbContext
    {
        // This constructor is required so we can pass the connection string from Program.cs
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        // This creates your table in Postgres
        public DbSet<WinEvent> WinEvents { get; set; }

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