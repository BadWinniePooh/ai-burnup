using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Models;
using BurnupApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/projects")]
public class ProjectsController(InMemoryStore store, BurnupService burnup) : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll() => Ok(store.GetProjects());

    [HttpGet("{id}")]
    public IActionResult Get(string id)
    {
        var project = store.GetProject(id);
        return project is null ? NotFound() : Ok(project);
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateProjectRequest req)
    {
        if (!DateOnly.TryParse(req.StartDate, out var startDate))
            return BadRequest("StartDate must be yyyy-MM-dd.");

        var id = req.Name.ToLowerInvariant().Replace(" ", "-");
        if (store.GetProject(id) is not null)
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

        store.AddProject(project);
        return CreatedAtAction(nameof(Get), new { id = project.Id }, project);
    }

    [HttpPut("{id}")]
    public IActionResult Update(string id, [FromBody] UpdateProjectRequest req)
    {
        var existing = store.GetProject(id);
        if (existing is null) return NotFound();

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

        store.UpdateProject(updated);
        return Ok(updated);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id) =>
        store.DeleteProject(id) ? NoContent() : NotFound();

    // ── Burnup ───────────────────────────────────────────────────────

    [HttpGet("{id}/burnup")]
    public IActionResult GetBurnup(string id, [FromQuery] string? today = null)
    {
        var project = store.GetProject(id);
        if (project is null) return NotFound();

        DateOnly? todayDate = null;
        if (today is not null)
        {
            if (!DateOnly.TryParse(today, out var td))
                return BadRequest("today must be yyyy-MM-dd.");
            todayDate = td;
        }

        var cards  = store.GetCards(id);
        var series = burnup.BuildBurnup(cards, project.StartDate, todayDate);
        return Ok(series);
    }
}
