using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/projects")]
public class ProjectsController(DataStore store, BurnupService burnup) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await store.GetProjectsAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var project = await store.GetProjectAsync(id);
        return project is null ? NotFound() : Ok(project);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateProjectRequest req)
    {
        if (!DateOnly.TryParse(req.StartDate, out var startDate))
            return BadRequest("StartDate must be yyyy-MM-dd.");

        var id = req.Name.ToLowerInvariant().Replace(" ", "-");
        if (await store.GetProjectAsync(id) is not null)
            return Conflict($"A project with id '{id}' already exists.");

        var project = new Project
        {
            Id          = id,
            Name        = req.Name,
            Code        = req.Code.ToUpperInvariant(),
            Description = req.Description,
            Color       = req.Color,
            StartDate   = startDate,
        };

        await store.AddProjectAsync(project);
        return CreatedAtAction(nameof(Get), new { id = project.Id }, project);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateProjectRequest req)
    {
        if (await store.GetProjectAsync(id) is null) return NotFound();

        if (!DateOnly.TryParse(req.StartDate, out var startDate))
            return BadRequest("StartDate must be yyyy-MM-dd.");

        var updated = new Project
        {
            Id          = id,
            Name        = req.Name,
            Code        = req.Code.ToUpperInvariant(),
            Description = req.Description,
            Color       = req.Color,
            StartDate   = startDate,
        };

        await store.UpdateProjectAsync(updated);
        return Ok(updated);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id) =>
        await store.DeleteProjectAsync(id) ? NoContent() : NotFound();

    // ── Burnup ───────────────────────────────────────────────────────

    [HttpGet("{id}/burnup")]
    public async Task<IActionResult> GetBurnup(string id, [FromQuery] string? today = null)
    {
        var project = await store.GetProjectAsync(id);
        if (project is null) return NotFound();

        DateOnly? todayDate = null;
        if (today is not null)
        {
            if (!DateOnly.TryParse(today, out var td))
                return BadRequest("today must be yyyy-MM-dd.");
            todayDate = td;
        }

        var cards  = await store.GetCardsAsync(id);
        var series = burnup.BuildBurnup(cards, project.StartDate, todayDate);
        return Ok(series);
    }
}
