using System.Security.Claims;
using BurnupApi.Data;
using BurnupApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/projects/{projectId}/shares")]
[Authorize]
public class SharesController(DataStore store) : ControllerBase
{
    private int  CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
    private bool IsSysAdmin    => User.IsInRole("admin");

    // ── Share management ──────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetShares(string projectId)
    {
        var role = await store.GetProjectRoleAsync(projectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (role is not ("owner" or "admin")) return Forbid();

        var shares = await store.GetSharesAsync(projectId);
        if (shares.Count == 0) return Ok(Array.Empty<ShareResponse>());

        var users = await store.GetUsersByIdsAsync(shares.Select(s => s.UserId).ToList());
        var emailMap = users.ToDictionary(u => u.Id, u => u.Email);

        return Ok(shares.Select(s => new ShareResponse(
            s.Id, s.UserId,
            emailMap.GetValueOrDefault(s.UserId, "unknown"),
            s.Role, s.CreatedAt)));
    }

    [HttpPost]
    public async Task<IActionResult> AddShare(string projectId, [FromBody] AddShareRequest req)
    {
        var role = await store.GetProjectRoleAsync(projectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (role is not ("owner" or "admin")) return Forbid();

        if (!IsValidGrantableRole(req.Role))
            return BadRequest("Role must be viewer, editor, or admin.");

        var targetUser = await store.GetUserByEmailAsync(req.Email.Trim().ToLowerInvariant());
        if (targetUser is null) return NotFound("No user with that email.");

        var project = await store.GetProjectAsync(projectId);
        if (project?.UserId == targetUser.Id)
            return Conflict("Cannot share a project with its owner.");

        var share = await store.AddShareAsync(projectId, targetUser.Id, req.Role);
        if (share is null) return Conflict("Project already shared with that user.");

        return Ok(new ShareResponse(share.Id, share.UserId, targetUser.Email, share.Role, share.CreatedAt));
    }

    [HttpPut("{shareId:int}")]
    public async Task<IActionResult> UpdateShare(string projectId, int shareId, [FromBody] UpdateShareRequest req)
    {
        var role = await store.GetProjectRoleAsync(projectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (role is not ("owner" or "admin")) return Forbid();

        if (!IsValidGrantableRole(req.Role))
            return BadRequest("Role must be viewer, editor, or admin.");

        return await store.UpdateShareAsync(shareId, projectId, req.Role) ? NoContent() : NotFound();
    }

    [HttpDelete("{shareId:int}")]
    public async Task<IActionResult> RemoveShare(string projectId, int shareId)
    {
        var role = await store.GetProjectRoleAsync(projectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (role is not ("owner" or "admin")) return Forbid();

        return await store.RemoveShareAsync(shareId, projectId) ? NoContent() : NotFound();
    }

    // ── Public link ───────────────────────────────────────────────────

    [HttpPost("public-link")]
    public async Task<IActionResult> EnablePublicLink(string projectId)
    {
        var role = await store.GetProjectRoleAsync(projectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (role is not ("owner" or "admin")) return Forbid();

        var token = await store.EnablePublicSharingAsync(projectId);
        return Ok(new { token });
    }

    [HttpDelete("public-link")]
    public async Task<IActionResult> DisablePublicLink(string projectId)
    {
        var role = await store.GetProjectRoleAsync(projectId, CurrentUserId, IsSysAdmin);
        if (role is null) return NotFound();
        if (role is not ("owner" or "admin")) return Forbid();

        await store.DisablePublicSharingAsync(projectId);
        return NoContent();
    }

    private static bool IsValidGrantableRole(string role) =>
        role is "viewer" or "editor" or "admin";
}
