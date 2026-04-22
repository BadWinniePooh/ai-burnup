using BurnupApi.Models;

namespace BurnupApi.Data;

public class InMemoryStore
{
    private readonly List<Project> _projects;
    private readonly List<Card> _cards;

    public InMemoryStore()
    {
        (_projects, _cards) = SeedData.Generate();
    }

    // ── Projects ──────────────────────────────────────────────────

    public IReadOnlyList<Project> GetProjects() => _projects.AsReadOnly();

    public Project? GetProject(string id) =>
        _projects.FirstOrDefault(p => p.Id == id);

    public Project AddProject(Project project)
    {
        _projects.Add(project);
        return project;
    }

    public bool UpdateProject(Project project)
    {
        var idx = _projects.FindIndex(p => p.Id == project.Id);
        if (idx < 0) return false;
        _projects[idx] = project;
        return true;
    }

    public bool DeleteProject(string id)
    {
        var idx = _projects.FindIndex(p => p.Id == id);
        if (idx < 0) return false;
        _projects.RemoveAt(idx);
        return true;
    }

    // ── Cards ─────────────────────────────────────────────────────

    public IReadOnlyList<Card> GetCards(string? projectId = null) =>
        (projectId is null ? _cards : _cards.Where(c => c.ProjectId == projectId))
        .OrderBy(c => c.CreatedDate)
        .ThenBy(c => c.CardNumber)
        .ToList()
        .AsReadOnly();

    public Card? GetCard(string uid) =>
        _cards.FirstOrDefault(c => c.Uid == uid);

    public Card AddCard(Card card)
    {
        _cards.Add(card);
        return card;
    }

    public bool UpdateCard(Card card)
    {
        var idx = _cards.FindIndex(c => c.Uid == card.Uid);
        if (idx < 0) return false;
        _cards[idx] = card;
        return true;
    }

    public bool DeleteCard(string uid)
    {
        var idx = _cards.FindIndex(c => c.Uid == uid);
        if (idx < 0) return false;
        _cards.RemoveAt(idx);
        return true;
    }

    public bool CardNumberConflicts(string projectId, string excludeUid, int cardNumber) =>
        _cards.Any(c => c.ProjectId == projectId && c.Uid != excludeUid && c.CardNumber == cardNumber);
}
