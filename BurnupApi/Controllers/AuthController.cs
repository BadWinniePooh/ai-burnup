using System.Security.Claims;
using BurnupApi.Data;
using BurnupApi.DTOs;
using BurnupApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(DataStore store, JwtService jwt, EmailService email, IConfiguration config) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var user = await store.GetUserByEmailAsync(req.Email.ToLowerInvariant());
        if (user is null || !user.IsActive || !store.VerifyPassword(user, req.Password))
            return Unauthorized("Invalid credentials.");

        return Ok(new AuthResponse(jwt.GenerateToken(user), user.Email, user.Role));
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var normalizedEmail = req.Email.ToLowerInvariant();

        if (await store.GetUserByEmailAsync(normalizedEmail) is not null)
            return Conflict("An account with that email already exists.");

        var registrationOpen = await store.GetRegistrationEnabledAsync();

        if (!registrationOpen)
        {
            // Invite required
            if (string.IsNullOrWhiteSpace(req.InviteToken))
                return Forbid(); // 403 — invite-only mode

            var invite = await store.GetValidInviteAsync(req.InviteToken);
            if (invite is null)
                return BadRequest("Invalid or expired invite link.");

            if (invite.Email is not null && invite.Email != normalizedEmail)
                return BadRequest("This invite was issued for a different email address.");

            await store.ConsumeInviteAsync(invite);
        }

        var user = await store.CreateUserAsync(normalizedEmail, req.Password);
        return Ok(new AuthResponse(jwt.GenerateToken(user), user.Email, user.Role));
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        var user = await store.GetUserByEmailAsync(req.Email.ToLowerInvariant());
        if (user is null || !user.IsActive)
            return NoContent(); // always 204 to prevent email enumeration

        var token     = await store.CreateResetTokenAsync(user.Id);
        var appUrl    = config["AppUrl"] ?? "http://localhost:5500";
        var resetLink = $"{appUrl}/#/reset-password?token={token.Token}";

        var devLink = await email.SendPasswordResetAsync(user.Email, resetLink);

        // In dev mode (no SMTP), return the link so the user can reset without email
        if (devLink is not null)
            return Ok(new { resetLink = devLink, dev = true });

        return NoContent();
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
    {
        if (req.NewPassword.Length < 8)
            return BadRequest("Password must be at least 8 characters.");

        var token = await store.GetValidResetTokenAsync(req.Token);
        if (token is null)
            return BadRequest("Invalid or expired reset link.");

        var user = await store.GetUserByIdAsync(token.UserId);
        if (user is null || !user.IsActive)
            return BadRequest("Account not found.");

        await store.UpdatePasswordAsync(user, req.NewPassword);
        await store.ConsumeResetTokenAsync(token);

        return Ok(new AuthResponse(jwt.GenerateToken(user), user.Email, user.Role));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
        var user   = await store.GetUserByIdAsync(userId);
        if (user is null) return Unauthorized();
        return Ok(new UserResponse(user.Id, user.Email, user.Role, user.IsActive, user.CreatedAt));
    }

    [Authorize]
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMe()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
        await store.DeleteUserAsync(userId);
        return NoContent();
    }
}
