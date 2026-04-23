namespace BurnupApi.DTOs;

public record ImportSnapshotRow(
    string Date,
    int    ScopeCount,
    int    DoneCount,
    double ScopeDays,
    double DoneDays
);
