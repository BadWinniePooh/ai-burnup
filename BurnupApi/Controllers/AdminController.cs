using System.Security.Claims;
using BurnupApi.Data;
using BurnupApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "admin")]
public class AdminController(DataStore store) : ControllerBase
{
    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

    // ── Users ─────────────────────────────────────────────────────

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var users = await store.GetAllUsersAsync();
        return Ok(users.Select(u => new UserResponse(u.Id, u.Email, u.Role, u.IsActive, u.CreatedAt)));
    }

    [HttpDelete("users/{id:int}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        if (id == CurrentUserId)
            return BadRequest("You cannot delete your own account.");

        var user = await store.GetUserByIdAsync(id);
        if (user is null) return NotFound();

        await store.DeleteUserAsync(id);
        return NoContent();
    }

    // ── App settings ──────────────────────────────────────────────

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var enabled = await store.GetRegistrationEnabledAsync();
        return Ok(new AppSettingsDto(enabled));
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSettingsRequest req)
    {
        await store.SetRegistrationEnabledAsync(req.RegistrationEnabled);
        return Ok(new AppSettingsDto(req.RegistrationEnabled));
    }

    // ── Invites ───────────────────────────────────────────────────

    [HttpGet("invites")]
    public async Task<IActionResult> GetInvites()
    {
        var invites = await store.GetInvitesAsync();
        return Ok(invites.Select(i => new InviteResponse(i.Id, i.Token, i.Email, i.ExpiresAt, i.Used)));
    }

    [HttpPost("invites")]
    public async Task<IActionResult> CreateInvite([FromBody] CreateInviteRequest req)
    {
        var invite = await store.CreateInviteAsync(CurrentUserId, req.Email);
        return Ok(new InviteResponse(invite.Id, invite.Token, invite.Email, invite.ExpiresAt, invite.Used));
    }

    // ── Unassigned projects ───────────────────────────────────────

    [HttpGet("projects/unassigned")]
    public async Task<IActionResult> GetUnassignedProjects()
    {
        var projects = await store.GetUnassignedProjectsAsync();
        return Ok(projects);
    }

    [HttpPut("projects/{id}/assign")]
    public async Task<IActionResult> AssignProject(string id, [FromBody] AssignProjectRequest req)
    {
        // If assigning to a specific user, verify that user exists
        if (req.UserId.HasValue)
        {
            var target = await store.GetUserByIdAsync(req.UserId.Value);
            if (target is null) return BadRequest("User not found.");
        }

        return await store.AssignProjectAsync(id, req.UserId) ? NoContent() : NotFound();
    }
}
