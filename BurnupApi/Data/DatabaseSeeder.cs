using Microsoft.EntityFrameworkCore;

namespace BurnupApi.Data;

public class DatabaseSeeder(BurnupDbContext db)
{
    public async Task SeedAsync()
    {
        if (await db.Projects.AnyAsync()) return;

        var (projects, cards) = SeedData.Generate();
        db.Projects.AddRange(projects);
        db.Cards.AddRange(cards);
        await db.SaveChangesAsync();
    }
}
