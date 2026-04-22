using BurnupApi.DTOs;
using BurnupApi.Models;

namespace BurnupApi.Services;

public class BurnupService
{
    public List<BurnupPoint> BuildBurnup(
        IEnumerable<Card> cards,
        DateOnly projectStartDate,
        DateOnly? today = null)
    {
        var todayDate = today ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var cardList = cards.ToList();

        if (cardList.Count == 0) return [];

        var days = Math.Max(1, todayDate.DayNumber - projectStartDate.DayNumber);
        var result = new List<BurnupPoint>(days + 1);

        for (int i = 0; i <= days; i++)
        {
            var d = projectStartDate.AddDays(i);

            int scopeCount = 0, doneCount = 0;
            double scopeDays = 0, doneDays = 0;

            foreach (var c in cardList)
            {
                if (c.CreatedDate <= d)
                {
                    scopeCount++;
                    scopeDays += c.EstimationDays;
                }

                if (c.EndDate.HasValue && c.EndDate.Value <= d)
                {
                    doneCount++;
                    doneDays += c.EstimationDays;
                }
            }

            result.Add(new BurnupPoint(
                Date:       d.ToString("yyyy-MM-dd"),
                ScopeCount: scopeCount,
                DoneCount:  doneCount,
                ScopeDays:  Math.Round(scopeDays, 1),
                DoneDays:   Math.Round(doneDays, 1)
            ));
        }

        return result;
    }
}
