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

    public static (int scopeCount, double scopeDays, int doneCount, double doneDays)
        ComputeDayTotals(DateOnly date, IEnumerable<Card> cards)
    {
        int scopeCount = 0, doneCount = 0;
        double scopeDays = 0, doneDays = 0;
        foreach (var c in cards)
        {
            if (c.CreatedDate <= date)
            {
                scopeCount++;
                scopeDays += c.EstimationDays;
            }
            if (c.EndDate.HasValue && c.EndDate.Value <= date)
            {
                doneCount++;
                var from = c.StartedDate ?? c.CreatedDate;
                doneDays += Math.Max(0.5, WorkdayCalculator.CountWorkdays(from, c.EndDate.Value));
            }
        }
        return (scopeCount, scopeDays, doneCount, doneDays);
    }
}
