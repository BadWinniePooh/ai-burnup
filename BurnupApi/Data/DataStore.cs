using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.EntityFrameworkCore;

namespace BurnupApi.Data;

// EF Core-backed data store. Registered as Scoped so each request gets
// its own DbContext instance (required by EF Core).
public class DataStore(BurnupDbContext db)
{
    // ── Projects ──────────────────────────────────────────────────

    public Task<List<Project>> GetProjectsAsync() =>
        db.Projects.OrderBy(p => p.Name).ToListAsync();

    public async Task<Project?> GetProjectAsync(string id) =>
        await db.Projects.FindAsync(id);

    public async Task<Project> AddProjectAsync(Project project)
    {
        db.Projects.Add(project);
        await db.SaveChangesAsync();
        return project;
    }

    public async Task<bool> UpdateProjectAsync(Project project)
    {
        var existing = await db.Projects.FindAsync(project.Id);
        if (existing is null) return false;
        db.Entry(existing).CurrentValues.SetValues(project);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteProjectAsync(string id)
    {
        var project = await db.Projects.FindAsync(id);
        if (project is null) return false;
        var cards = await db.Cards.Where(c => c.ProjectId == id).ToListAsync();
        db.Cards.RemoveRange(cards);
        db.Projects.Remove(project);
        await db.SaveChangesAsync();
        return true;
    }

    // ── Cards ─────────────────────────────────────────────────────

    public Task<List<Card>> GetCardsAsync(string? projectId = null)
    {
        var q = db.Cards.AsQueryable();
        if (projectId is not null) q = q.Where(c => c.ProjectId == projectId);
        return q.OrderBy(c => c.CreatedDate).ThenBy(c => c.CardNumber).ToListAsync();
    }

    public async Task<Card?> GetCardAsync(string uid) =>
        await db.Cards.FindAsync(uid);

    public async Task<Card> AddCardAsync(Card card)
    {
        db.Cards.Add(card);
        await db.SaveChangesAsync();
        return card;
    }

    public async Task<bool> UpdateCardAsync(Card card)
    {
        var existing = await db.Cards.FindAsync(card.Uid);
        if (existing is null) return false;
        db.Entry(existing).CurrentValues.SetValues(card);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteCardAsync(string uid)
    {
        var card = await db.Cards.FindAsync(uid);
        if (card is null) return false;
        db.Cards.Remove(card);
        await db.SaveChangesAsync();
        return true;
    }

    public Task<bool> CardNumberConflictsAsync(string projectId, string excludeUid, int cardNumber) =>
        db.Cards.AnyAsync(c => c.ProjectId == projectId && c.Uid != excludeUid && c.CardNumber == cardNumber);

    // ── Daily snapshots ───────────────────────────────────────────

    public Task<List<DailySnapshot>> GetSnapshotsAsync(string projectId) =>
        db.Snapshots.Where(s => s.ProjectId == projectId).OrderBy(s => s.Date).ToListAsync();

    public async Task UpsertSnapshotsAsync(string projectId, List<DailySnapshot> snapshots)
    {
        var dates = snapshots.Select(s => s.Date).ToHashSet();
        var existing = await db.Snapshots
            .Where(s => s.ProjectId == projectId && dates.Contains(s.Date))
            .ToListAsync();
        var existingByDate = existing.ToDictionary(s => s.Date);

        foreach (var s in snapshots)
        {
            if (existingByDate.TryGetValue(s.Date, out var row))
            {
                row.ScopeCount = s.ScopeCount;
                row.DoneCount  = s.DoneCount;
                row.ScopeDays  = s.ScopeDays;
                row.DoneDays   = s.DoneDays;
            }
            else
            {
                db.Snapshots.Add(s);
            }
        }
        await db.SaveChangesAsync();
    }

    public async Task EnsurePastSnapshotsAsync(string projectId, List<Card> cards, DateOnly from, DateOnly through)
    {
        if (through < from) return;

        var existing = (await db.Snapshots
            .Where(s => s.ProjectId == projectId && s.Date >= from && s.Date <= through)
            .Select(s => s.Date)
            .ToListAsync())
            .ToHashSet();

        var toAdd = new List<DailySnapshot>();
        for (var d = from; d <= through; d = d.AddDays(1))
        {
            if (existing.Contains(d)) continue;
            var (sc, sd, dc, dd) = DomainService.ComputeDayTotals(d, cards);
            toAdd.Add(new DailySnapshot
            {
                ProjectId  = projectId,
                Date       = d,
                ScopeCount = sc,
                DoneCount  = dc,
                ScopeDays  = Math.Round(sd, 1),
                DoneDays   = Math.Round(dd, 1),
            });
        }

        if (toAdd.Count > 0)
        {
            db.Snapshots.AddRange(toAdd);
            await db.SaveChangesAsync();
        }
    }
}
