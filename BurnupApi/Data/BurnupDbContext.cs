using BurnupApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BurnupApi.Data;

public class BurnupDbContext(DbContextOptions<BurnupDbContext> options) : DbContext(options)
{
    public DbSet<Project>       Projects  => Set<Project>();
    public DbSet<Card>          Cards     => Set<Card>();
    public DbSet<DailySnapshot> Snapshots => Set<DailySnapshot>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Project>().ToTable("projects");

        mb.Entity<Card>(e =>
        {
            e.ToTable("cards");
            e.HasKey(c => c.Uid);
            e.HasIndex(c => new { c.ProjectId, c.CardNumber });
        });

        mb.Entity<DailySnapshot>(e =>
        {
            e.ToTable("daily_snapshots");
            e.HasIndex(s => new { s.ProjectId, s.Date }).IsUnique();
        });
    }
}
