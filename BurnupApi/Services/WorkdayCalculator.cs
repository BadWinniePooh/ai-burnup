using System.Collections.Concurrent;

namespace BurnupApi.Services;

/// <summary>
/// Counts working days excluding weekends and German public holidays.
/// Holidays: New Year, Good Friday, Easter Sun/Mon, Labour Day,
/// Ascension, Whit Monday, Corpus Christi, Unity Day, All Saints,
/// Christmas Eve/Day/Boxing Day.
/// </summary>
public static class WorkdayCalculator
{
    private static readonly ConcurrentDictionary<int, HashSet<DateOnly>> _cache = new();

    // Meeus/Jones/Butcher algorithm — Gregorian Easter Sunday
    private static DateOnly EasterSunday(int year)
    {
        int a = year % 19;
        int b = year / 100;
        int c = year % 100;
        int d = b / 4;
        int e = b % 4;
        int f = (b + 8) / 25;
        int g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4;
        int k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day   = (h + l - 7 * m + 114) % 31 + 1;
        return new DateOnly(year, month, day);
    }

    private static HashSet<DateOnly> HolidaysForYear(int year) =>
        _cache.GetOrAdd(year, y =>
        {
            var e = EasterSunday(y);
            return
            [
                new(y,  1,  1),    // New Year's Day        (1.1.)
                e.AddDays(-2),     // Good Friday           (Easter-2)
                e,                 // Easter Sunday         (Easter)
                e.AddDays(1),      // Easter Monday         (Easter+1)
                new(y,  5,  1),    // Labour Day            (1.5.)
                e.AddDays(39),     // Ascension Day         (Easter+39)
                e.AddDays(50),     // Whit Monday           (Easter+50)
                e.AddDays(60),     // Corpus Christi        (Easter+60)
                new(y, 10,  3),    // German Unity Day      (3.10.)
                new(y, 11,  1),    // All Saints' Day       (1.11.)
                new(y, 12, 24),    // Christmas Eve         (24.12.)
                new(y, 12, 25),    // Christmas Day         (25.12.)
                new(y, 12, 26),    // Boxing Day            (26.12.)
            ];
        });

    private static bool IsWorkday(DateOnly date) =>
        date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)
        && !HolidaysForYear(date.Year).Contains(date);

    /// <summary>
    /// Number of working days in [from, to] — both endpoints inclusive.
    /// A card started and finished on the same workday counts as 1.
    /// Returns 0 when to &lt; from.
    /// </summary>
    public static double CountWorkdays(DateOnly from, DateOnly to)
    {
        if (to < from) return 0;
        int count = 0;
        for (var d = from; d <= to; d = d.AddDays(1))
            if (IsWorkday(d)) count++;
        return count;
    }
}
