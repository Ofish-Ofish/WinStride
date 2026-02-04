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
    }
}