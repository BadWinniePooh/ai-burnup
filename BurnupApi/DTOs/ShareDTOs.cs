namespace BurnupApi.DTOs;

public record AddShareRequest(string Email, string Role);
public record UpdateShareRequest(string Role);
public record ShareResponse(int Id, int UserId, string Email, string Role, DateTime CreatedAt);

public record ProjectWithRoleResponse(
    string   Id,
    string   Name,
    string   Code,
    string?  Description,
    string   Color,
    string   StartDate,
    int?     UserId,
    string?  PublicToken,
    string   UserRole
);
