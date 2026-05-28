namespace BurnupApi.Models;

public class Project
{
    public string  Id          { get; set; } = string.Empty;
    public string  Name        { get; set; } = string.Empty;
    public string  Code        { get; set; } = string.Empty;
    public string  Description { get; set; } = string.Empty;
    public string  Color       { get; set; } = string.Empty;
    public DateOnly StartDate  { get; set; }
    public int?    UserId      { get; set; } // null = unassigned
    public string? PublicToken { get; set; } // non-null = public dashboard enabled
    public string  CardTypes   { get; set; } = "feature,bug,no-code,tiny";
    public string  ScopeTypes  { get; set; } = "mvp,mlp,other";

    public string[] GetCardTypesList()  => CardTypes .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    public string[] GetScopeTypesList() => ScopeTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
