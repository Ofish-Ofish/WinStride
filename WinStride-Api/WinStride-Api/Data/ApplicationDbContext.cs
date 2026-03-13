using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using System;
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
            ApplyUtcDateTimeConverters(modelBuilder);

            modelBuilder.Entity<WinEvent>(entity =>
            {
                entity.HasIndex(e => new { e.LogName, e.TimeCreated });
                entity.HasIndex(e => e.EventId);
                entity.HasIndex(e => e.TimeCreated);
                entity.HasIndex(e => e.Pid);
            });

            modelBuilder.Entity<TCPView>(entity =>
            {
                entity.ToTable("WinNetworkConnections");
                entity.HasIndex(e => e.BatchId);
                entity.HasIndex(e => new { e.MachineName, e.TimeCreated });
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
                entity.HasIndex(e => new { e.MachineName, e.TimeSynced });
            });

            modelBuilder.Entity<WinProcess>(entity =>
            {
                entity.HasKey(e => e.Id);

                entity.Property(e => e.MachineName).IsRequired();
                entity.Property(e => e.BatchId).IsRequired();

                entity.HasIndex(e => new { e.MachineName, e.BatchId });
                entity.HasIndex(e => e.Pid);
            });

            base.OnModelCreating(modelBuilder);
        }

        private static void ApplyUtcDateTimeConverters(ModelBuilder modelBuilder)
        {
            var utcConverter = new ValueConverter<DateTime, DateTime>(
                value => value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime(),
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc));

            var nullableUtcConverter = new ValueConverter<DateTime?, DateTime?>(
                value => value.HasValue
                    ? (value.Value.Kind == DateTimeKind.Utc ? value.Value : value.Value.ToUniversalTime())
                    : value,
                value => value.HasValue
                    ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc)
                    : value);

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                foreach (var property in entityType.GetProperties())
                {
                    if (property.ClrType == typeof(DateTime))
                    {
                        property.SetValueConverter(utcConverter);
                    }
                    else if (property.ClrType == typeof(DateTime?))
                    {
                        property.SetValueConverter(nullableUtcConverter);
                    }
                }
            }
        }
    }
}

