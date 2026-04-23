namespace BurnupApi.Models;

public class DailySnapshot
{
    public int     Id         { get; set; }
    public string  ProjectId  { get; set; } = string.Empty;
    public DateOnly Date      { get; set; }
    public int     ScopeCount { get; set; }
    public int     DoneCount  { get; set; }
    public double  ScopeDays  { get; set; }
    public double  DoneDays   { get; set; }
}
