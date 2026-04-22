using System.Text.Json;
using BurnupApi.Data;
using BurnupApi.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy        = JsonNamingPolicy.CamelCase;
    o.JsonSerializerOptions.DefaultIgnoreCondition      = System.Text.Json.Serialization.JsonIgnoreCondition.Never;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c => c.SwaggerDoc("v1", new() { Title = "Burnup PM API", Version = "v1" }));

// PostgreSQL via EF Core
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

builder.Services.AddDbContext<BurnupDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddScoped<DataStore>();
builder.Services.AddSingleton<BurnupService>();

builder.Services.AddCors(o =>
    o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Ensure schema exists and seed if empty.
// Retries with exponential back-off so the backend survives postgres starting slowly.
await using (var scope = app.Services.CreateAsyncScope())
{
    var db     = scope.ServiceProvider.GetRequiredService<BurnupDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    for (int attempt = 1; attempt <= 6; attempt++)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            await new DatabaseSeeder(db).SeedAsync();
            logger.LogInformation("Database ready.");
            break;
        }
        catch (Exception ex) when (attempt < 6)
        {
            var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt - 1)); // 1 2 4 8 16 s
            logger.LogWarning("Database not ready (attempt {Attempt}): {Message}. Retrying in {Delay}s…",
                attempt, ex.Message, delay.TotalSeconds);
            await Task.Delay(delay);
        }
    }
}

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Burnup PM API v1"));
app.UseAuthorization();
app.MapControllers();

app.Run();
