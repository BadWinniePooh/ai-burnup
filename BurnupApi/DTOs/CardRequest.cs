namespace BurnupApi.DTOs;

public record CreateCardRequest(
    int     CardNumber,
    string  ProjectId,
    string  Title,
    string  CreatedDate,
    string? StartedDate,
    string? EndDate,
    double  Estimation,
    string  EstimationUnit,
    string  Type,
    string  Scope
);

public record UpdateCardRequest(
    int     CardNumber,
    string  Title,
    string  CreatedDate,
    string? StartedDate,
    string? EndDate,
    double  Estimation,
    string  EstimationUnit,
    string  Type,
    string  Scope
);
