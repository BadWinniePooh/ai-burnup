using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/public")]
public class PublicController(DataStore store, BurnupService burnup) : ControllerBase
{
    [HttpGet("{token}")]
    public async Task<IActionResult> GetProject(string token)
    {
        var project = await store.GetProjectByPublicTokenAsync(token);
        if (project is null) return NotFound();

        return Ok(new
        {
            project.Id,
            project.Name,
            project.Code,
            project.Description,
            project.Color,
            StartDate = project.StartDate.ToString("yyyy-MM-dd"),
        });
    }

    [HttpGet("{token}/burnup")]
    public async Task<IActionResult> GetBurnup(string token, [FromQuery] string? today = null)
    {
        var project = await store.GetProjectByPublicTokenAsync(token);
        if (project is null) return NotFound();

        var todayDate = DateOnly.FromDateTime(DateTime.UtcNow);
        if (today is not null)
        {
            if (!DateOnly.TryParse(today, out var td))
                return BadRequest("today must be yyyy-MM-dd.");
            todayDate = td;
        }

        var cards     = await store.GetCardsAsync(project.Id);
        await store.EnsurePastSnapshotsAsync(project.Id, cards, project.StartDate, todayDate.AddDays(-1));
        var snapshots = await store.GetSnapshotsAsync(project.Id);
        var series    = burnup.BuildBurnup(snapshots, cards, project.StartDate, todayDate);
        return Ok(series);
    }

    [HttpGet("{token}/cards")]
    public async Task<IActionResult> GetCards(string token)
    {
        var project = await store.GetProjectByPublicTokenAsync(token);
        if (project is null) return NotFound();

        var cards = await store.GetCardsAsync(project.Id);
        return Ok(cards.Select(c => new
        {
            c.Uid,
            c.CardNumber,
            c.ProjectId,
            DisplayId      = DomainService.GetDisplayId(c, project),
            c.Title,
            CreatedDate    = c.CreatedDate.ToString("yyyy-MM-dd"),
            StartedDate    = c.StartedDate?.ToString("yyyy-MM-dd"),
            EndDate        = c.EndDate?.ToString("yyyy-MM-dd"),
            c.Estimation,
            c.EstimationUnit,
            c.EstimationDays,
            c.Type,
            c.Scope,
            Status         = DomainService.GetStatus(c),
        }));
    }
}
