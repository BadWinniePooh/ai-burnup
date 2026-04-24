using BurnupApi.Data;

namespace BurnupApi.Services;

// Wakes at midnight UTC each day and freezes snapshots for all projects
// through yesterday, ensuring historical data is preserved even if the
// burnup endpoint wasn't requested on that day.
public class SnapshotWorker(IServiceScopeFactory scopeFactory, ILogger<SnapshotWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var now  = DateTime.UtcNow;
            var next = now.Date.AddDays(1);  // next midnight UTC
            await Task.Delay(next - now, ct);
            if (ct.IsCancellationRequested) break;
            await TakeSnapshotsAsync();
        }
    }

    private async Task TakeSnapshotsAsync()
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var store       = scope.ServiceProvider.GetRequiredService<DataStore>();
            var yesterday   = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
            var projects    = await store.GetAllProjectsAsync();

            foreach (var project in projects)
            {
                var cards = await store.GetCardsAsync(project.Id);
                await store.EnsurePastSnapshotsAsync(project.Id, cards, project.StartDate, yesterday);
            }

            logger.LogInformation("Daily snapshot: {Count} projects snapshotted through {Date}.",
                projects.Count, yesterday);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Daily snapshot failed.");
        }
    }
}
