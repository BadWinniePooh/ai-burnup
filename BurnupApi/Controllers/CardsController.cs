using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/cards")]
public class CardsController(InMemoryStore store) : ControllerBase
{
    private static readonly string[] ValidTypes  = ["feature", "bug", "no-code", "tiny"];
    private static readonly string[] ValidScopes = ["mvp", "mlp", "other"];
    private static readonly string[] ValidUnits  = ["days", "points"];

    [HttpGet]
    public IActionResult GetAll([FromQuery] string? projectId = null)
    {
        var cards = store.GetCards(projectId);
        return Ok(cards.Select(c => ToResponse(c, store)));
    }

    [HttpGet("{uid}")]
    public IActionResult Get(string uid)
    {
        var card = store.GetCard(uid);
        return card is null ? NotFound() : Ok(ToResponse(card, store));
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateCardRequest req)
    {
        var project = store.GetProject(req.ProjectId);
        if (project is null)
            return BadRequest($"Project '{req.ProjectId}' not found.");

        if (ValidateCard(req.Type, req.Scope, req.EstimationUnit, req.CreatedDate, req.StartedDate, req.EndDate,
            out var validationError, out var createdDate, out var startedDate, out var endDate))
            return BadRequest(validationError);

        var uid = $"{req.ProjectId}:{Guid.NewGuid():N}";

        if (store.CardNumberConflicts(req.ProjectId, uid, req.CardNumber))
            return Conflict($"Card number {req.CardNumber} is already used in project '{req.ProjectId}'.");

        var card = new Card
        {
            Uid            = uid,
            CardNumber     = req.CardNumber,
            ProjectId      = req.ProjectId,
            Title          = req.Title,
            CreatedDate    = createdDate,
            StartedDate    = startedDate,
            EndDate        = endDate,
            Estimation     = req.Estimation,
            EstimationUnit = req.EstimationUnit,
            EstimationDays = DomainService.CalculateEstimationDays(req.Estimation, req.EstimationUnit),
            Type           = req.Type,
            Scope          = req.Scope,
        };

        store.AddCard(card);
        return CreatedAtAction(nameof(Get), new { uid = card.Uid }, ToResponse(card, store));
    }

    [HttpPut("{uid}")]
    public IActionResult Update(string uid, [FromBody] UpdateCardRequest req)
    {
        var existing = store.GetCard(uid);
        if (existing is null) return NotFound();

        if (ValidateCard(req.Type, req.Scope, req.EstimationUnit, req.CreatedDate, req.StartedDate, req.EndDate,
            out var validationError, out var createdDate, out var startedDate, out var endDate))
            return BadRequest(validationError);

        if (store.CardNumberConflicts(existing.ProjectId, uid, req.CardNumber))
            return Conflict($"Card number {req.CardNumber} is already used in project '{existing.ProjectId}'.");

        var updated = new Card
        {
            Uid            = uid,
            CardNumber     = req.CardNumber,
            ProjectId      = existing.ProjectId,
            Title          = req.Title,
            CreatedDate    = createdDate,
            StartedDate    = startedDate,
            EndDate        = endDate,
            Estimation     = req.Estimation,
            EstimationUnit = req.EstimationUnit,
            EstimationDays = DomainService.CalculateEstimationDays(req.Estimation, req.EstimationUnit),
            Type           = req.Type,
            Scope          = req.Scope,
        };

        store.UpdateCard(updated);
        return Ok(ToResponse(updated, store));
    }

    [HttpDelete("{uid}")]
    public IActionResult Delete(string uid) =>
        store.DeleteCard(uid) ? NoContent() : NotFound();

    // ── Helpers ───────────────────────────────────────────────────

    private static CardResponse ToResponse(Card card, InMemoryStore store)
    {
        var project   = store.GetProject(card.ProjectId);
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

    // Returns true if there is a validation error (sets validationError).
    // Returns false on success (sets the parsed date outputs).
    private static bool ValidateCard(
        string type, string scope, string estimationUnit,
        string createdDateStr, string? startedDateStr, string? endDateStr,
        out string? validationError,
        out DateOnly createdDate, out DateOnly? startedDate, out DateOnly? endDate)
    {
        createdDate = default;
        startedDate = null;
        endDate     = null;

        if (!ValidTypes.Contains(type))
        {
            validationError = $"Type must be one of: {string.Join(", ", ValidTypes)}.";
            return true;
        }

        if (!ValidScopes.Contains(scope))
        {
            validationError = $"Scope must be one of: {string.Join(", ", ValidScopes)}.";
            return true;
        }

        if (!ValidUnits.Contains(estimationUnit))
        {
            validationError = $"EstimationUnit must be one of: {string.Join(", ", ValidUnits)}.";
            return true;
        }

        if (!DateOnly.TryParse(createdDateStr, out createdDate))
        {
            validationError = "CreatedDate must be yyyy-MM-dd.";
            return true;
        }

        if (startedDateStr is not null)
        {
            if (!DateOnly.TryParse(startedDateStr, out var sd))
            {
                validationError = "StartedDate must be yyyy-MM-dd.";
                return true;
            }
            startedDate = sd;
        }

        if (endDateStr is not null)
        {
            if (!DateOnly.TryParse(endDateStr, out var ed))
            {
                validationError = "EndDate must be yyyy-MM-dd.";
                return true;
            }
            endDate = ed;
        }

        validationError = null;
        return false;
    }
}
