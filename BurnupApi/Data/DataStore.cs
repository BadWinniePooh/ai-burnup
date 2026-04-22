using BurnupApi.Models;
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
}
