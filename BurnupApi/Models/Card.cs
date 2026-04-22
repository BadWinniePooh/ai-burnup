namespace BurnupApi.Models;

public class Card
{
    public string Uid { get; set; } = string.Empty;
    public int CardNumber { get; set; }
    public string ProjectId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public DateOnly CreatedDate { get; set; }
    public DateOnly? StartedDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public double Estimation { get; set; }
    public string EstimationUnit { get; set; } = "days";
    public double EstimationDays { get; set; }
    public string Type { get; set; } = "feature";
    public string Scope { get; set; } = "mvp";
}
