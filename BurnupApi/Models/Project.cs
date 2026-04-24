namespace BurnupApi.Models;

public class Project
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public int?     UserId    { get; set; } // null = unassigned
}
