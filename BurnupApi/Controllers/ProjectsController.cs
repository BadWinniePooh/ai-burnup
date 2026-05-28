using System.Security.Claims;
using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController(DataStore store, BurnupService burnup) : ControllerBase
{
    private int  CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
    private bool IsSysAdmin    => User.IsInRole("admin");

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var projects = await store.GetProjectsWithRolesAsync(CurrentUserId, IsSysAdmin);
        return Ok(projects.Select(t => ToResponse(t.Project, t.Role)));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var role = await store.GetProjectRoleAsync(id, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        var project = await store.GetProjectAsync(id);
        return project is null ? NotFound() : Ok(ToResponse(project, role));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateProjectRequest req)
    {
        if (!DateOnly.TryParse(req.StartDate, out var startDate))
            return BadRequest("StartDate must be yyyy-MM-dd.");

        var code = req.Code.ToUpperInvariant();

        if (await store.ProjectNameExistsForUserAsync(req.Name, CurrentUserId))
            return Conflict("You already have a project with that name.");
        if (await store.ProjectCodeExistsForUserAsync(code, CurrentUserId))
            return Conflict("You already have a project with that code.");

        var cardTypes  = req.CardTypes  is { Length: > 0 } ct ? ct : DefaultCardTypes;
        var scopeTypes = req.ScopeTypes is { Length: > 0 } st ? st : DefaultScopeTypes;

        if (ValidateTypesField(cardTypes,  "CardTypes")  is string e1) return BadRequest(e1);
        if (ValidateTypesField(scopeTypes, "ScopeTypes") is string e2) return BadRequest(e2);

        var project = new Project
        {
            Id          = Guid.NewGuid().ToString(),
            Name        = req.Name,
            Code        = code,
            Description = req.Description,
            Color       = req.Color,
            StartDate   = startDate,
            UserId      = CurrentUserId,
            CardTypes   = string.Join(",", cardTypes),
            ScopeTypes  = string.Join(",", scopeTypes),
        };

        await store.AddProjectAsync(project);
        return CreatedAtAction(nameof(Get), new { id = project.Id }, ToResponse(project, "owner"));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateProjectRequest req)
    {
        var role = await store.GetProjectRoleAsync(id, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (!CanEdit(role)) return Forbid();

        var existing = await store.GetProjectAsync(id);
        if (existing is null) return NotFound();

        if (!DateOnly.TryParse(req.StartDate, out var startDate))
            return BadRequest("StartDate must be yyyy-MM-dd.");

        var code = req.Code.ToUpperInvariant();

        if (await store.ProjectNameExistsForUserAsync(req.Name, existing.UserId ?? CurrentUserId, id))
            return Conflict("You already have a project with that name.");
        if (await store.ProjectCodeExistsForUserAsync(code, existing.UserId ?? CurrentUserId, id))
            return Conflict("You already have a project with that code.");

        var cardTypes  = req.CardTypes  is { Length: > 0 } ct ? ct : existing.GetCardTypesList();
        var scopeTypes = req.ScopeTypes is { Length: > 0 } st ? st : existing.GetScopeTypesList();

        if (ValidateTypesField(cardTypes,  "CardTypes")  is string e1) return BadRequest(e1);
        if (ValidateTypesField(scopeTypes, "ScopeTypes") is string e2) return BadRequest(e2);

        var updated = new Project
        {
            Id          = id,
            Name        = req.Name,
            Code        = code,
            Description = req.Description,
            Color       = req.Color,
            StartDate   = startDate,
            UserId      = existing.UserId,
            PublicToken = existing.PublicToken,
            CardTypes   = string.Join(",", cardTypes),
            ScopeTypes  = string.Join(",", scopeTypes),
        };

        await store.UpdateProjectAsync(updated);
        return Ok(ToResponse(updated, role));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var role = await store.GetProjectRoleAsync(id, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (!CanDelete(role)) return Forbid();
        return await store.DeleteProjectAsync(id) ? NoContent() : NotFound();
    }

    // ── Snapshots ────────────────────────────────────────────────────

    [HttpPost("{id}/snapshots")]
    public async Task<IActionResult> ImportSnapshots(string id, [FromBody] List<ImportSnapshotRow> rows)
    {
        var role = await store.GetProjectRoleAsync(id, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (!CanEdit(role)) return Forbid();

        var snapshots = rows
            .Where(r => DateOnly.TryParse(r.Date, out _))
            .Select(r => {
                DateOnly.TryParse(r.Date, out var date);
                return new DailySnapshot
                {
                    ProjectId  = id,
                    Date       = date,
                    ScopeCount = r.ScopeCount,
                    DoneCount  = r.DoneCount,
                    ScopeDays  = Math.Round(r.ScopeDays, 1),
                    DoneDays   = Math.Round(r.DoneDays,  1),
                };
            })
            .ToList();

        await store.UpsertSnapshotsAsync(id, snapshots);
        return Ok(new { imported = snapshots.Count });
    }

    // ── Burnup ───────────────────────────────────────────────────────

    [HttpGet("{id}/burnup")]
    public async Task<IActionResult> GetBurnup(string id, [FromQuery] string? today = null)
    {
        var role = await store.GetProjectRoleAsync(id, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();

        var project = await store.GetProjectAsync(id);
        if (project is null) return NotFound();

        var todayDate = DateOnly.FromDateTime(DateTime.UtcNow);
        if (today is not null)
        {
            if (!DateOnly.TryParse(today, out var td))
                return BadRequest("today must be yyyy-MM-dd.");
            todayDate = td;
        }

        var cards = await store.GetCardsAsync(id);
        await store.EnsurePastSnapshotsAsync(id, cards, project.StartDate, todayDate.AddDays(-1));
        var snapshots = await store.GetSnapshotsAsync(id);
        var series = burnup.BuildBurnup(snapshots, cards, project.StartDate, todayDate);
        return Ok(series);
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private static readonly string[] DefaultCardTypes  = ["feature", "bug", "no-code", "tiny"];
    private static readonly string[] DefaultScopeTypes = ["mvp", "mlp", "other"];

    private static ProjectWithRoleResponse ToResponse(Project p, string role) =>
        new(p.Id, p.Name, p.Code, p.Description, p.Color,
            p.StartDate.ToString("yyyy-MM-dd"), p.UserId, p.PublicToken, role,
            p.GetCardTypesList(), p.GetScopeTypesList());

    private static string? ValidateTypesField(string[] values, string fieldName)
    {
        if (values.Length == 0) return $"{fieldName} must have at least one value.";
        if (values.Length > 20) return $"{fieldName} may have at most 20 values.";
        foreach (var v in values)
        {
            if (string.IsNullOrWhiteSpace(v)) return $"{fieldName} values must not be empty.";
            if (v.Length > 40) return $"{fieldName} values must be 40 characters or fewer.";
            if (!System.Text.RegularExpressions.Regex.IsMatch(v, @"^[a-zA-Z0-9\-_ ]+$"))
                return $"{fieldName} values may only contain letters, digits, hyphens, underscores, and spaces.";
        }
        return null;
    }

    private static bool CanEdit(string role)   => role is "owner" or "admin" or "editor";
    private static bool CanDelete(string role) => role is "owner" or "admin";
}
