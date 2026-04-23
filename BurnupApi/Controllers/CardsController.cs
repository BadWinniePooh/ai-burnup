using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/cards")]
public class CardsController(DataStore store) : ControllerBase
{
    private static readonly string[] ValidTypes  = ["feature", "bug", "no-code", "tiny"];
    private static readonly string[] ValidScopes = ["mvp", "mlp", "other"];
    private static readonly string[] ValidUnits  = ["days", "points"];

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? projectId = null)
    {
        var cards    = await store.GetCardsAsync(projectId);
        var projects = await store.GetProjectsAsync();
        var lookup   = projects.ToDictionary(p => p.Id);
        return Ok(cards.Select(c => ToResponse(c, lookup.GetValueOrDefault(c.ProjectId))));
    }

    [HttpGet("{uid}")]
    public async Task<IActionResult> Get(string uid)
    {
        var card = await store.GetCardAsync(uid);
        if (card is null) return NotFound();
        var project = await store.GetProjectAsync(card.ProjectId);
        return Ok(ToResponse(card, project));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCardRequest req)
    {
        if (await store.GetProjectAsync(req.ProjectId) is null)
            return BadRequest($"Project '{req.ProjectId}' not found.");

        if (ValidateCard(req.Type, req.Scope, req.EstimationUnit, req.CreatedDate, req.StartedDate, req.EndDate,
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
        var project = await store.GetProjectAsync(card.ProjectId);
        return CreatedAtAction(nameof(Get), new { uid = card.Uid }, ToResponse(card, project));
    }

    [HttpPut("{uid}")]
    public async Task<IActionResult> Update(string uid, [FromBody] UpdateCardRequest req)
    {
        var existing = await store.GetCardAsync(uid);
        if (existing is null) return NotFound();

        if (ValidateCard(req.Type, req.Scope, req.EstimationUnit, req.CreatedDate, req.StartedDate, req.EndDate,
            out var error, out var created, out var started, out var ended))
            return BadRequest(error);

        if (await store.CardNumberConflictsAsync(existing.ProjectId, uid, req.CardNumber))
            return Conflict($"Card number {req.CardNumber} is already used in project '{existing.ProjectId}'.");

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
        var project = await store.GetProjectAsync(updated.ProjectId);
        return Ok(ToResponse(updated, project));
    }

    [HttpDelete("{uid}")]
    public async Task<IActionResult> Delete(string uid) =>
        await store.DeleteCardAsync(uid) ? NoContent() : NotFound();

    // ── Helpers ───────────────────────────────────────────────────

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
        out string? error,
        out DateOnly createdDate, out DateOnly? startedDate, out DateOnly? endDate)
    {
        createdDate = default;
        startedDate = null;
        endDate     = null;

        if (!ValidTypes.Contains(type))
        { error = $"Type must be one of: {string.Join(", ", ValidTypes)}."; return true; }

        if (!ValidScopes.Contains(scope))
        { error = $"Scope must be one of: {string.Join(", ", ValidScopes)}."; return true; }

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
