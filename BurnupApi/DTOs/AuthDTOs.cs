namespace BurnupApi.DTOs;

public record LoginRequest(string Email, string Password);
public record RegisterRequest(string Email, string Password, string? InviteToken);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string NewPassword);
public record AuthResponse(string Token, string Email, string Role);
public record UserResponse(int Id, string Email, string Role, bool IsActive, DateTime CreatedAt);
public record CreateInviteRequest(string? Email);
public record InviteResponse(int Id, string Token, string? Email, DateTime ExpiresAt, bool Used);
public record AssignProjectRequest(int? UserId);
public record AppSettingsDto(bool RegistrationEnabled);
public record UpdateSettingsRequest(bool RegistrationEnabled);
