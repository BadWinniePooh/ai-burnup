using System.Security.Claims;
using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/cards")]
[Authorize]
public class CardsController(DataStore store) : ControllerBase
{
    private static readonly string[] ValidUnits = ["days", "points"];

    private int  CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
    private bool IsSysAdmin    => User.IsInRole("admin");

    private static readonly CardResponse MissingProjectResponse = new(
        Uid: string.Empty,
        CardNumber: 0,
        ProjectId: string.Empty,
        DisplayId: "???-???",
        Title: "???",
        CreatedDate: "0000-00-00",
        StartedDate: null,
        EndDate: null,
        Estimation: 0,
        EstimationUnit: "days",
        EstimationDays: 0,
        Type: "unknown",
        Scope: "unknown",
        Status: "missing"
    );

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? projectId = null)
    {
        if (projectId is not null &&
            await store.GetProjectRoleAsync(projectId, CurrentUserId, IsSysAdmin) is null)
            return NotFound();

        var cards    = await store.GetCardsAsync(projectId);
        var projects = await store.GetAllProjectsAsync();
        var lookup   = projects.ToDictionary(p => p.Id);
        return Ok(cards.Select(c => ToResponse(c, lookup.GetValueOrDefault(c.ProjectId))));
    }

    [HttpGet("{uid}")]
    public async Task<IActionResult> Get(string uid)
    {
        var card = await store.GetCardAsync(uid);
        if (card is null) return NotFound();
        if (await store.GetProjectRoleAsync(card.ProjectId, CurrentUserId, IsSysAdmin) is null)
            return NotFound();
        var project = await store.GetProjectAsync(card.ProjectId);
        return Ok(project is not null ? ToResponse(card, project) : MissingProjectResponse);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCardRequest req)
    {
        var role = await store.GetProjectRoleAsync(req.ProjectId, CurrentUserId, IsSysAdmin);
        if (role is null) return BadRequest($"Project '{req.ProjectId}' not found.");
        if (!CanEdit(role)) return Forbid();

        var project = await store.GetProjectAsync(req.ProjectId);
        if (project is null) return BadRequest($"Project '{req.ProjectId}' not found.");

        if (ValidateCard(req.Type, req.Scope, req.EstimationUnit, req.CreatedDate, req.StartedDate, req.EndDate,
            project.GetCardTypesList(), project.GetScopeTypesList(),
            out var error, out var created, out var started, out var ended))
            return BadRequest(error);

        var uid = $"{req.ProjectId}:{Guid.NewGuid():N}";

        if (await store.CardNumberConflictsAsync(req.ProjectId, uid, req.CardNumber))
            return Conflict($"Card number {req.CardNumber} is already used in project '{req.ProjectId}'.");

        var card = new Card
        {
            Uid            = uid,
            CardNumber     = req.CardNumber,
            ProjectId      = req.ProjectId,
            Title          = req.Title,
            CreatedDate    = created,
            StartedDate    = started,
            EndDate        = ended,
            Estimation     = req.Estimation,
            EstimationUnit = req.EstimationUnit,
            EstimationDays = DomainService.CalculateEstimationDays(req.Estimation, req.EstimationUnit),
            Type           = req.Type,
            Scope          = req.Scope,
        };

        await store.AddCardAsync(card);
        await store.DeleteSnapshotsFromAsync(card.ProjectId, card.CreatedDate);
        return CreatedAtAction(nameof(Get), new { uid = card.Uid }, ToResponse(card, project));
    }

    [HttpPut("{uid}")]
    public async Task<IActionResult> Update(string uid, [FromBody] UpdateCardRequest req)
    {
        var existing = await store.GetCardAsync(uid);
        if (existing is null) return NotFound();

        var role = await store.GetProjectRoleAsync(existing.ProjectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (!CanEdit(role)) return Forbid();

        var project = await store.GetProjectAsync(existing.ProjectId);
        if (project is null) return NotFound();

        if (ValidateCard(req.Type, req.Scope, req.EstimationUnit, req.CreatedDate, req.StartedDate, req.EndDate,
            project.GetCardTypesList(), project.GetScopeTypesList(),
            out var error, out var created, out var started, out var ended))
            return BadRequest(error);

        if (await store.CardNumberConflictsAsync(existing.ProjectId, uid, req.CardNumber))
            return Conflict($"Card number {req.CardNumber} is already used in project '{existing.ProjectId}'.");

        // Capture old dates before EF overwrites the tracked entity in UpdateCardAsync
        var oldCreated = existing.CreatedDate;
        var oldStarted = existing.StartedDate;
        var oldEnded   = existing.EndDate;

        var updated = new Card
        {
            Uid            = uid,
            CardNumber     = req.CardNumber,
            ProjectId      = existing.ProjectId,
            Title          = req.Title,
            CreatedDate    = created,
            StartedDate    = started,
            EndDate        = ended,
            Estimation     = req.Estimation,
            EstimationUnit = req.EstimationUnit,
            EstimationDays = DomainService.CalculateEstimationDays(req.Estimation, req.EstimationUnit),
            Type           = req.Type,
            Scope          = req.Scope,
        };

        await store.UpdateCardAsync(updated);

        // Invalidate snapshots from the earliest date either version of the card affects
        var allDates = new[] { oldCreated, created }
            .Concat(new[] { oldStarted, oldEnded, started, ended }
                .Where(d => d.HasValue).Select(d => d!.Value));
        await store.DeleteSnapshotsFromAsync(updated.ProjectId, allDates.Min());

        return Ok(ToResponse(updated, project));
    }

    [HttpDelete("{uid}")]
    public async Task<IActionResult> Delete(string uid)
    {
        var card = await store.GetCardAsync(uid);
        if (card is null) return NotFound();

        var role = await store.GetProjectRoleAsync(card.ProjectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (!CanEdit(role)) return Forbid();

        if (!await store.DeleteCardAsync(uid)) return NotFound();
        await store.DeleteSnapshotsFromAsync(card.ProjectId, card.CreatedDate);
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────

    private static bool CanEdit(string role) => role is "owner" or "admin" or "editor";

    private static CardResponse ToResponse(Card card, Project? project)
    {
        var displayId = project is not null ? DomainService.GetDisplayId(card, project) : $"???-{card.CardNumber:D3}";
        return new CardResponse(
            Uid:            card.Uid,
            CardNumber:     card.CardNumber,
            ProjectId:      card.ProjectId,
            DisplayId:      displayId,
            Title:          card.Title,
            CreatedDate:    card.CreatedDate.ToString("yyyy-MM-dd"),
            StartedDate:    card.StartedDate?.ToString("yyyy-MM-dd"),
            EndDate:        card.EndDate?.ToString("yyyy-MM-dd"),
            Estimation:     card.Estimation,
            EstimationUnit: card.EstimationUnit,
            EstimationDays: card.EstimationDays,
            Type:           card.Type,
            Scope:          card.Scope,
            Status:         DomainService.GetStatus(card)
        );
    }

    private static bool ValidateCard(
        string type, string scope, string estimationUnit,
        string createdDateStr, string? startedDateStr, string? endDateStr,
        string[] validTypes, string[] validScopes,
        out string? error,
        out DateOnly createdDate, out DateOnly? startedDate, out DateOnly? endDate)
    {
        createdDate = default;
        startedDate = null;
        endDate     = null;

        if (!validTypes.Contains(type))
        { error = $"Type must be one of: {string.Join(", ", validTypes)}."; return true; }

        if (!validScopes.Contains(scope))
        { error = $"Scope must be one of: {string.Join(", ", validScopes)}."; return true; }

        if (!ValidUnits.Contains(estimationUnit))
        { error = $"EstimationUnit must be one of: {string.Join(", ", ValidUnits)}."; return true; }

        if (!DateOnly.TryParse(createdDateStr, out createdDate))
        { error = "CreatedDate must be yyyy-MM-dd."; return true; }

        if (startedDateStr is not null)
        {
            if (!DateOnly.TryParse(startedDateStr, out var sd))
            { error = "StartedDate must be yyyy-MM-dd."; return true; }
            startedDate = sd;
        }

        if (endDateStr is not null)
        {
            if (!DateOnly.TryParse(endDateStr, out var ed))
            { error = "EndDate must be yyyy-MM-dd."; return true; }
            endDate = ed;
        }

        error = null;
        return false;
    }
}
