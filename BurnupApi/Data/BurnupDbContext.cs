using BurnupApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BurnupApi.Data;

public class BurnupDbContext(DbContextOptions<BurnupDbContext> options) : DbContext(options)
{
    public DbSet<Project>            Projects       => Set<Project>();
    public DbSet<Card>               Cards          => Set<Card>();
    public DbSet<DailySnapshot>      Snapshots      => Set<DailySnapshot>();
    public DbSet<User>               Users          => Set<User>();
    public DbSet<PasswordResetToken> ResetTokens    => Set<PasswordResetToken>();
    public DbSet<Invite>             Invites        => Set<Invite>();
    public DbSet<AppConfig>          AppConfigs     => Set<AppConfig>();
    public DbSet<ProjectShare>       ProjectShares  => Set<ProjectShare>();

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

        mb.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasIndex(u => u.Email).IsUnique();
        });

        mb.Entity<PasswordResetToken>(e =>
        {
            e.ToTable("password_reset_tokens");
            e.HasIndex(t => t.Token);
        });

        mb.Entity<Invite>(e =>
        {
            e.ToTable("invites");
            e.HasIndex(i => i.Token);
        });

        mb.Entity<AppConfig>(e =>
        {
            e.ToTable("app_config");
            e.HasKey(c => c.Key);
        });

        mb.Entity<ProjectShare>(e =>
        {
            e.ToTable("project_shares");
            e.HasIndex(s => new { s.ProjectId, s.UserId }).IsUnique();
        });
    }
}
