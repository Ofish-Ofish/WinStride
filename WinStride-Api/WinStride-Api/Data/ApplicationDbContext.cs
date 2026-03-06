using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WinStride_Api.Models;
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
        public DbSet<TCPView> NetworkConnections { get; set; }
        public DbSet<AutorunView> AutorunViews { get; set; }
        public DbSet<WinProcess> WinProcesses { get; set; }

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

            modelBuilder.Entity<TCPView>(entity =>
            {
                entity.ToTable("WinNetworkConnections");

                entity.HasIndex(e => e.BatchId);

                entity.HasIndex(e => new { e.MachineName, e.TimeCreated })
                      .IsDescending(false, true);
            });

            modelBuilder.Entity<AutorunView>(entity =>
            {
                entity.ToTable("WinAutoruns");

                entity.Property(e => e.Md5).IsRequired(false);
                entity.Property(e => e.Sha1).IsRequired(false);
                entity.Property(e => e.Sha256).IsRequired(false);
                entity.Property(e => e.ImagePath).IsRequired(false);

                entity.HasIndex(e => e.BatchId);

                entity.HasIndex(e => e.Entry);

                entity.HasIndex(e => new { e.MachineName, e.TimeSynced })
                      .IsDescending(false, true);
            });

            modelBuilder.Entity<WinProcess>(entity =>
            {
                entity.HasKey(e => e.Id);

                entity.Property(e => e.MachineName).IsRequired();
                entity.Property(e => e.BatchId).IsRequired();

                entity.Property(e => e.WorkingSetSize).HasColumnType("bigint");

                entity.HasIndex(e => new { e.MachineName, e.BatchId });

                entity.HasIndex(e => e.Pid);
            });
        }
    }
}

