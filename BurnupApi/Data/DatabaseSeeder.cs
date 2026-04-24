using BurnupApi.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BurnupApi.Data;

public class DatabaseSeeder(BurnupDbContext db, ILogger<DatabaseSeeder> logger)
{
    private static readonly PasswordHasher<User> Hasher = new();

    public async Task SeedAsync()
    {
        await EnsureAdminAsync();
        await EnsureAppConfigAsync();
        await EnsureSampleDataAsync();
    }

    private async Task EnsureAdminAsync()
    {
        var email    = Environment.GetEnvironmentVariable("ADMIN_EMAIL");
        var password = Environment.GetEnvironmentVariable("ADMIN_PASSWORD");

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning(
                "ADMIN_EMAIL / ADMIN_PASSWORD environment variables not set. " +
                "No admin account will be created automatically.");
            return;
        }

        var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (existing is null)
        {
            var admin = new User { Email = email, Role = "admin", IsActive = true, CreatedAt = DateTime.UtcNow };
            admin.PasswordHash = Hasher.HashPassword(admin, password);
            db.Users.Add(admin);
            await db.SaveChangesAsync();
            logger.LogInformation("Admin account created for {Email}.", email);
        }
        else if (existing.Role != "admin")
        {
            existing.Role = "admin";
            await db.SaveChangesAsync();
            logger.LogInformation("Existing account {Email} promoted to admin.", email);
        }
    }

    private async Task EnsureAppConfigAsync()
    {
        if (!await db.AppConfigs.AnyAsync(c => c.Key == "registration_enabled"))
        {
            db.AppConfigs.Add(new AppConfig { Key = "registration_enabled", Value = "true" });
            await db.SaveChangesAsync();
        }
    }

    private async Task EnsureSampleDataAsync()
    {
        if (await db.Projects.AnyAsync()) return;

        var (projects, cards) = SeedData.Generate();
        db.Projects.AddRange(projects);
        db.Cards.AddRange(cards);
        await db.SaveChangesAsync();
    }
}
