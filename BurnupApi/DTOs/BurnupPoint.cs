namespace BurnupApi.DTOs;

public record BurnupPoint(
    string Date,
    int    ScopeCount,
    int    DoneCount,
    double ScopeDays,
    double DoneDays
);
