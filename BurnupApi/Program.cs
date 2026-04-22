using System.Text.Json;
using BurnupApi.Data;
using BurnupApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Burnup PM API", Version = "v1" });
});

// In-memory store is a singleton so state is shared across all requests
builder.Services.AddSingleton<InMemoryStore>();
builder.Services.AddSingleton<BurnupService>();

// Allow any origin so the static HTML frontend can call the API during development
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

app.UseCors();

app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Burnup PM API v1"));

app.UseAuthorization();
app.MapControllers();

app.Run();
