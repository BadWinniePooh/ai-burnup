namespace BurnupApi.Models;

public class ProjectShare
{
    public int      Id        { get; set; }
    public string   ProjectId { get; set; } = string.Empty;
    public int      UserId    { get; set; }
    public string   Role      { get; set; } = "viewer"; // viewer | editor | admin
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
