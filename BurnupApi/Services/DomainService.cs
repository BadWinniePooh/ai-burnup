using BurnupApi.Models;

namespace BurnupApi.Services;

public static class DomainService
{
    public static string GetDisplayId(Card card, Project project) =>
        $"{project.Code}-{card.CardNumber:D3}";

    public static double CalculateEstimationDays(double estimation, string estimationUnit) =>
        estimationUnit == "points" ? Math.Max(0.5, estimation / 1.5) : estimation;

    public static string GetStatus(Card card)
    {
        if (card.EndDate.HasValue) return "done";
        if (card.StartedDate.HasValue) return "active";
        return "backlog";
    }
}
