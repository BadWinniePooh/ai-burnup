using BurnupApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BurnupApi.Data;

public class BurnupDbContext(DbContextOptions<BurnupDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Card>    Cards    => Set<Card>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Project>().ToTable("projects");

        mb.Entity<Card>(e =>
        {
            e.ToTable("cards");
            // Index for card-number uniqueness checks within a project
            e.HasIndex(c => new { c.ProjectId, c.CardNumber });
        });
    }
}
