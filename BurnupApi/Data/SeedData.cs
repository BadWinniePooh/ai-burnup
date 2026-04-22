using BurnupApi.Models;

namespace BurnupApi.Data;

// Deterministic seed data — replicates the JS mulberry32 PRNG used in the frontend design
// so the generated cards match the sample data the UI was built against.
public static class SeedData
{
    private static readonly string[] CardTypes = ["feature", "bug", "no-code", "tiny"];

    private static readonly string[] FeatureWords =
    [
        "Auth flow", "Dashboard", "Settings panel", "Onboarding", "Notifications",
        "Search", "Filters", "Export", "Import wizard", "Webhook receiver",
        "API rate limiter", "Billing portal", "Team invites", "SSO provider",
        "Dark mode", "Keyboard shortcuts", "Empty states", "Bulk actions",
    ];

    private static readonly string[] BugWords =
    [
        "Date picker timezone", "Modal focus trap", "Pagination off-by-one",
        "Stale cache on logout", "Race condition on save", "Crash on empty list",
        "Incorrect sort order", "Missing ARIA labels",
    ];

    private static readonly string[] NoCodeWords =
    [
        "Copy review", "Add help docs", "Pricing page content", "Terms update",
        "Blog draft", "Email template", "Landing hero copy",
    ];

    private static readonly string[] TinyWords =
    [
        "Fix typo in footer", "Update favicon", "Adjust spacing", "Rename label",
        "Remove console.log", "Update deps", "Tweak accent color",
    ];

    public static (List<Project> Projects, List<Card> Cards) Generate()
    {
        var projects = new List<Project>
        {
            new() { Id = "aurora",   Name = "Aurora",   Code = "AUR", Description = "Internal analytics platform",    Color = "oklch(0.62 0.15 258)", StartDate = new DateOnly(2025, 9,  1)  },
            new() { Id = "harbor",   Name = "Harbor",   Code = "HBR", Description = "Customer-facing payments API",   Color = "oklch(0.62 0.15 178)", StartDate = new DateOnly(2025, 11, 15) },
            new() { Id = "meridian", Name = "Meridian", Code = "MRD", Description = "Mobile companion app",           Color = "oklch(0.68 0.14 62)",  StartDate = new DateOnly(2026, 1,  10) },
        };

        var cards = new List<Card>();
        cards.AddRange(GenCards("aurora",   24, 101, new DateOnly(2025, 9,  1),  8));
        cards.AddRange(GenCards("harbor",   18, 202, new DateOnly(2025, 11, 15), 6));
        cards.AddRange(GenCards("meridian", 21, 303, new DateOnly(2026, 1,  10), 5));

        return (projects, cards);
    }

    private static List<Card> GenCards(string projectId, int count, uint originalSeed, DateOnly startDate, int horizonMonths)
    {
        var cards = new List<Card>();
        var horizonDays = horizonMonths * 30;
        uint rng = originalSeed; // mutable PRNG state; originalSeed stays fixed for UIDs

        for (int i = 0; i < count; i++)
        {
            // Order of rng calls must exactly match the JS genCards loop
            var type = CardTypes[(int)(Rnd(ref rng) * CardTypes.Length)];

            string scope;
            if (Rnd(ref rng) < 0.6) scope = "mvp";
            else scope = Rnd(ref rng) < 0.6 ? "mlp" : "other";

            var createdOffset = (int)(Rnd(ref rng) * horizonDays * 0.6);
            var created = startDate.AddDays(createdOffset);

            double estDays = type switch
            {
                "tiny"    => 0.5 + (int)(Rnd(ref rng) * 2) * 0.5,
                "no-code" => 1   + (int)(Rnd(ref rng) * 2),
                "bug"     => 1   + (int)(Rnd(ref rng) * 3),
                _         => 2   + (int)(Rnd(ref rng) * 7),
            };

            var estUnit = Rnd(ref rng) < 0.75 ? "days" : "points";
            double estimation = estUnit == "points"
                ? Math.Max(1, (int)Math.Round(estDays * 1.5, MidpointRounding.AwayFromZero))
                : estDays;

            bool isStarted = Rnd(ref rng) < 0.85;
            DateOnly? started = null;
            if (isStarted)
            {
                var startedOffset = createdOffset + (int)(Rnd(ref rng) * 8);
                started = startDate.AddDays(startedOffset);
            }

            bool isCompleted = isStarted && Rnd(ref rng) < 0.62;
            DateOnly? endDate = null;
            if (isCompleted)
            {
                var duration = Math.Max(1, (int)Math.Round(estDays + (Rnd(ref rng) - 0.3) * estDays, MidpointRounding.AwayFromZero));
                endDate = started!.Value.AddDays(duration);
            }

            // Title is the last rnd call per iteration — matches JS object literal evaluation order
            var title = GenerateTitle(type, ref rng);

            var cardNumber = i + 1;
            cards.Add(new Card
            {
                Uid            = $"{projectId}:{cardNumber}:{originalSeed}",
                CardNumber     = cardNumber,
                ProjectId      = projectId,
                Title          = title,
                CreatedDate    = created,
                StartedDate    = started,
                EndDate        = endDate,
                Estimation     = estimation,
                EstimationUnit = estUnit,
                EstimationDays = estDays,
                Type           = type,
                Scope          = scope,
            });
        }

        return [.. cards.OrderBy(c => c.CreatedDate.ToString("yyyy-MM-dd"))];
    }

    private static string GenerateTitle(string type, ref uint rng)
    {
        var pool = type switch
        {
            "bug"     => BugWords,
            "no-code" => NoCodeWords,
            "tiny"    => TinyWords,
            _         => FeatureWords,
        };
        return pool[(int)(Rnd(ref rng) * pool.Length)];
    }

    // Replicates JS mulberry32 — see data.jsx. Uses uint so all arithmetic matches
    // JS bitwise ops (which treat values as 32-bit), including the >>> unsigned shifts.
    private static double Rnd(ref uint seed)
    {
        unchecked
        {
            seed += 0x6d2b79f5u;
            uint t = seed;
            t =  (t ^ (t >> 15)) * (t | 1u);
            t ^= t + (t ^ (t >> 7)) * (t | 61u);
            return (t ^ (t >> 14)) / 4294967296.0;
        }
    }
}
