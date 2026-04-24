using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BurnupApi.Data;

public class DataStore(BurnupDbContext db)
{
    private static readonly PasswordHasher<User> Hasher = new();

    // ── Users ─────────────────────────────────────────────────────

    public Task<User?> GetUserByEmailAsync(string email) =>
        db.Users.FirstOrDefaultAsync(u => u.Email == email);

    public Task<User?> GetUserByIdAsync(int id) =>
        db.Users.FindAsync(id).AsTask();

    public Task<List<User>> GetAllUsersAsync() =>
        db.Users.OrderBy(u => u.CreatedAt).ToListAsync();

    public Task<List<User>> GetUsersByIdsAsync(List<int> ids) =>
        db.Users.Where(u => ids.Contains(u.Id)).ToListAsync();

    public async Task<User> CreateUserAsync(string email, string password, string role = "user")
    {
        var user = new User { Email = email, Role = role, IsActive = true, CreatedAt = DateTime.UtcNow };
        user.PasswordHash = Hasher.HashPassword(user, password);
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    public bool VerifyPassword(User user, string password) =>
        Hasher.VerifyHashedPassword(user, user.PasswordHash, password)
            != PasswordVerificationResult.Failed;

    public async Task UpdatePasswordAsync(User user, string newPassword)
    {
        user.PasswordHash = Hasher.HashPassword(user, newPassword);
        await db.SaveChangesAsync();
    }

    public async Task DeleteUserAsync(int id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return;

        // Remove shares granted to this user
        db.ProjectShares.RemoveRange(
            await db.ProjectShares.Where(s => s.UserId == id).ToListAsync());

        // Cascade: delete all projects (with cards + snapshots + shares) owned by this user
        var projects = await db.Projects.Where(p => p.UserId == id).ToListAsync();
        if (projects.Count > 0)
        {
            var projectIds = projects.Select(p => p.Id).ToList();
            db.ProjectShares.RemoveRange(
                await db.ProjectShares.Where(s => projectIds.Contains(s.ProjectId)).ToListAsync());
            foreach (var p in projects)
            {
                db.Snapshots.RemoveRange(await db.Snapshots.Where(s => s.ProjectId == p.Id).ToListAsync());
                db.Cards    .RemoveRange(await db.Cards    .Where(c => c.ProjectId == p.Id).ToListAsync());
            }
        }
        db.Projects.RemoveRange(projects);
        db.Users   .Remove(user);
        await db.SaveChangesAsync();
    }

    // ── Password reset tokens ─────────────────────────────────────

    public async Task<PasswordResetToken> CreateResetTokenAsync(int userId)
    {
        var old = await db.ResetTokens
            .Where(t => t.UserId == userId && !t.Used && t.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();
        old.ForEach(t => t.Used = true);

        var token = new PasswordResetToken
        {
            UserId    = userId,
            Token     = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            ExpiresAt = DateTime.UtcNow.AddHours(1),
        };
        db.ResetTokens.Add(token);
        await db.SaveChangesAsync();
        return token;
    }

    public Task<PasswordResetToken?> GetValidResetTokenAsync(string token) =>
        db.ResetTokens.FirstOrDefaultAsync(t =>
            t.Token == token && !t.Used && t.ExpiresAt > DateTime.UtcNow);

    public async Task ConsumeResetTokenAsync(PasswordResetToken token)
    {
        token.Used = true;
        await db.SaveChangesAsync();
    }

    // ── Invites ───────────────────────────────────────────────────

    public async Task<Invite> CreateInviteAsync(int createdByUserId, string? email)
    {
        var invite = new Invite
        {
            Token           = Guid.NewGuid().ToString("N"),
            Email           = email?.ToLowerInvariant(),
            ExpiresAt       = DateTime.UtcNow.AddDays(7),
            CreatedByUserId = createdByUserId,
        };
        db.Invites.Add(invite);
        await db.SaveChangesAsync();
        return invite;
    }

    public Task<Invite?> GetValidInviteAsync(string token) =>
        db.Invites.FirstOrDefaultAsync(i =>
            i.Token == token && !i.Used && i.ExpiresAt > DateTime.UtcNow);

    public async Task ConsumeInviteAsync(Invite invite)
    {
        invite.Used = true;
        await db.SaveChangesAsync();
    }

    public Task<List<Invite>> GetInvitesAsync() =>
        db.Invites.OrderByDescending(i => i.ExpiresAt).ToListAsync();

    // ── App config ────────────────────────────────────────────────

    public async Task<bool> GetRegistrationEnabledAsync()
    {
        var cfg = await db.AppConfigs.FindAsync("registration_enabled");
        return cfg?.Value != "false";
    }

    public async Task SetRegistrationEnabledAsync(bool enabled)
    {
        var cfg = await db.AppConfigs.FindAsync("registration_enabled");
        if (cfg is null)
            db.AppConfigs.Add(new AppConfig { Key = "registration_enabled", Value = enabled ? "true" : "false" });
        else
            cfg.Value = enabled ? "true" : "false";
        await db.SaveChangesAsync();
    }

    // ── Projects ──────────────────────────────────────────────────

    // Returns projects with the caller's effective role. One query for shares + one for projects.
    public async Task<List<(Project Project, string Role)>> GetProjectsWithRolesAsync(int userId, bool isSysAdmin)
    {
        var shareMap = await db.ProjectShares
            .Where(s => s.UserId == userId)
            .ToDictionaryAsync(s => s.ProjectId, s => s.Role);

        var sharedIds = shareMap.Keys.ToList();

        var q = db.Projects.AsQueryable();
        q = isSysAdmin
            ? q.Where(p => p.UserId == userId || p.UserId == null || sharedIds.Contains(p.Id))
            : q.Where(p => p.UserId == userId || sharedIds.Contains(p.Id));

        var projects = await q.OrderBy(p => p.Name).ToListAsync();

        return projects.Select(p =>
        {
            string role = (p.UserId == userId || (isSysAdmin && p.UserId == null))
                ? "owner"
                : shareMap.GetValueOrDefault(p.Id, "viewer");
            return (p, role);
        }).ToList();
    }

    // Unfiltered — for internal use (snapshot worker, card lookup).
    public Task<List<Project>> GetAllProjectsAsync() =>
        db.Projects.OrderBy(p => p.Name).ToListAsync();

    public Task<Project?> GetProjectAsync(string id) =>
        db.Projects.FindAsync(id).AsTask();

    // Returns the project if the caller has any access (owner, shared, or sys-admin for unassigned).
    public async Task<Project?> GetProjectForUserAsync(string id, int userId, bool isSysAdmin)
    {
        var p = await db.Projects.FindAsync(id);
        if (p is null) return null;
        if (p.UserId == userId) return p;
        if (isSysAdmin && p.UserId == null) return p;
        if (await db.ProjectShares.AnyAsync(s => s.ProjectId == id && s.UserId == userId)) return p;
        return null;
    }

    // Returns "owner" | "admin" | "editor" | "viewer" | null (no access).
    public async Task<string?> GetProjectRoleAsync(string id, int userId, bool isSysAdmin)
    {
        var p = await db.Projects.FindAsync(id);
        if (p is null) return null;
        if (p.UserId == userId) return "owner";
        if (isSysAdmin && p.UserId == null) return "owner";
        var share = await db.ProjectShares
            .FirstOrDefaultAsync(s => s.ProjectId == id && s.UserId == userId);
        return share?.Role;
    }

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
        db.ProjectShares.RemoveRange(await db.ProjectShares.Where(s => s.ProjectId == id).ToListAsync());
        db.Snapshots    .RemoveRange(await db.Snapshots    .Where(s => s.ProjectId == id).ToListAsync());
        db.Cards        .RemoveRange(await db.Cards        .Where(c => c.ProjectId == id).ToListAsync());
        db.Projects     .Remove(project);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> AssignProjectAsync(string projectId, int? userId)
    {
        var project = await db.Projects.FindAsync(projectId);
        if (project is null) return false;
        project.UserId = userId;
        await db.SaveChangesAsync();
        return true;
    }

    public Task<bool> ProjectNameExistsForUserAsync(string name, int userId, string? excludeId = null) =>
        db.Projects.AnyAsync(p => p.UserId == userId
            && p.Name.ToLower() == name.ToLower()
            && (excludeId == null || p.Id != excludeId));

    public Task<bool> ProjectCodeExistsForUserAsync(string code, int userId, string? excludeId = null) =>
        db.Projects.AnyAsync(p => p.UserId == userId
            && p.Code.ToLower() == code.ToLower()
            && (excludeId == null || p.Id != excludeId));

    public Task<List<Project>> GetUnassignedProjectsAsync() =>
        db.Projects.Where(p => p.UserId == null).OrderBy(p => p.Name).ToListAsync();

    // ── Project shares ────────────────────────────────────────────

    public Task<List<ProjectShare>> GetSharesAsync(string projectId) =>
        db.ProjectShares.Where(s => s.ProjectId == projectId).ToListAsync();

    public async Task<ProjectShare?> AddShareAsync(string projectId, int userId, string role)
    {
        if (await db.ProjectShares.AnyAsync(s => s.ProjectId == projectId && s.UserId == userId))
            return null; // already shared
        var share = new ProjectShare { ProjectId = projectId, UserId = userId, Role = role, CreatedAt = DateTime.UtcNow };
        db.ProjectShares.Add(share);
        await db.SaveChangesAsync();
        return share;
    }

    public async Task<bool> UpdateShareAsync(int shareId, string projectId, string role)
    {
        var share = await db.ProjectShares
            .FirstOrDefaultAsync(s => s.Id == shareId && s.ProjectId == projectId);
        if (share is null) return false;
        share.Role = role;
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> RemoveShareAsync(int shareId, string projectId)
    {
        var share = await db.ProjectShares
            .FirstOrDefaultAsync(s => s.Id == shareId && s.ProjectId == projectId);
        if (share is null) return false;
        db.ProjectShares.Remove(share);
        await db.SaveChangesAsync();
        return true;
    }

    // ── Public sharing ────────────────────────────────────────────

    public async Task<string> EnablePublicSharingAsync(string projectId)
    {
        var project = await db.Projects.FindAsync(projectId)
            ?? throw new InvalidOperationException("Project not found.");
        project.PublicToken = Guid.NewGuid().ToString("N");
        await db.SaveChangesAsync();
        return project.PublicToken;
    }

    public async Task DisablePublicSharingAsync(string projectId)
    {
        var project = await db.Projects.FindAsync(projectId);
        if (project is null) return;
        project.PublicToken = null;
        await db.SaveChangesAsync();
    }

    public Task<Project?> GetProjectByPublicTokenAsync(string token) =>
        db.Projects.FirstOrDefaultAsync(p => p.PublicToken == token);

    // ── Cards ─────────────────────────────────────────────────────

    public Task<List<Card>> GetCardsAsync(string? projectId = null)
    {
        var q = db.Cards.AsQueryable();
        if (projectId is not null) q = q.Where(c => c.ProjectId == projectId);
        return q.OrderBy(c => c.CreatedDate).ThenBy(c => c.CardNumber).ToListAsync();
    }

    public Task<Card?> GetCardAsync(string uid) =>
        db.Cards.FindAsync(uid).AsTask();

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
        var dates       = snapshots.Select(s => s.Date).ToHashSet();
        var existing    = await db.Snapshots
            .Where(s => s.ProjectId == projectId && dates.Contains(s.Date))
            .ToListAsync();
        var existingMap = existing.ToDictionary(s => s.Date);

        foreach (var s in snapshots)
        {
            if (existingMap.TryGetValue(s.Date, out var row))
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
