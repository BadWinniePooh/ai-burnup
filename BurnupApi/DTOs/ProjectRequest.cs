namespace BurnupApi.DTOs;

public record CreateProjectRequest(
    string Name,
    string Code,
    string Description,
    string Color,
    string StartDate
);

public record UpdateProjectRequest(
    string Name,
    string Code,
    string Description,
    string Color,
    string StartDate
);
