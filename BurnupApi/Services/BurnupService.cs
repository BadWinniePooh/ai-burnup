using BurnupApi.DTOs;
using BurnupApi.Models;

namespace BurnupApi.Services;

public class BurnupService
{
    public List<BurnupPoint> BuildBurnup(
        List<DailySnapshot> snapshots,
        IEnumerable<Card> cards,
        DateOnly projectStartDate,
        DateOnly? today = null)
    {
        var todayDate = today ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var cardList = cards.ToList();
        var snapshotMap = snapshots.ToDictionary(s => s.Date);

        var days = Math.Max(1, todayDate.DayNumber - projectStartDate.DayNumber);
        var result = new List<BurnupPoint>(days + 1);

        for (int i = 0; i <= days; i++)
        {
            var d = projectStartDate.AddDays(i);

            if (snapshotMap.TryGetValue(d, out var snap))
            {
                result.Add(new BurnupPoint(
                    Date:       d.ToString("yyyy-MM-dd"),
                    ScopeCount: snap.ScopeCount,
                    DoneCount:  snap.DoneCount,
                    ScopeDays:  snap.ScopeDays,
                    DoneDays:   snap.DoneDays
                ));
            }
            else
            {
                var (sc, sd, dc, dd) = DomainService.ComputeDayTotals(d, cardList);
                result.Add(new BurnupPoint(
                    Date:       d.ToString("yyyy-MM-dd"),
                    ScopeCount: sc,
                    DoneCount:  dc,
                    ScopeDays:  Math.Round(sd, 1),
                    DoneDays:   Math.Round(dd, 1)
                ));
            }
        }

        return result;
    }
}
