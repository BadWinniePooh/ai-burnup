namespace BurnupApi.DTOs;

public record CreateProjectRequest(
    string    Name,
    string    Code,
    string    Description,
    string    Color,
    string    StartDate,
    string[]? CardTypes  = null,
    string[]? ScopeTypes = null
);

public record UpdateProjectRequest(
    string    Name,
    string    Code,
    string    Description,
    string    Color,
    string    StartDate,
    string[]? CardTypes  = null,
    string[]? ScopeTypes = null
);
