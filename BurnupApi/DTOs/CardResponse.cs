namespace BurnupApi.DTOs;

public record CardResponse(
    string  Uid,
    int     CardNumber,
    string  ProjectId,
    string  DisplayId,
    string  Title,
    string  CreatedDate,
    string? StartedDate,
    string? EndDate,
    double  Estimation,
    string  EstimationUnit,
    double  EstimationDays,
    string  Type,
    string  Scope,
    string  Status
);
