using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OneClickHost.Api.Data;
using OneClickHost.Api.Services;

var builder = WebApplication.CreateBuilder(args);

ValidateProductionConfiguration(builder.Configuration, builder.Environment);

// ── Database ─────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// ── Authentication ───────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (string.IsNullOrWhiteSpace(context.Token)
                    && context.Request.Cookies.TryGetValue("access_token", out var cookieToken))
                {
                    context.Token = cookieToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── Application Services ─────────────────────────
builder.Services.AddScoped<AuthService>();
builder.Services.AddSingleton<SecretEncryptionService>();
builder.Services.AddScoped<SecretBackfillService>();
builder.Services.AddScoped<ProjectService>();
builder.Services.AddScoped<ServiceService>();
builder.Services.AddScoped<DeploymentService>();
builder.Services.AddScoped<ExecutionNodeService>();
builder.Services.AddScoped<ProjectEventService>();
builder.Services.AddHostedService<ExecutionNodeMonitorService>();
builder.Services.AddHttpClient<IAiDeploymentDiagnosisService, AiDeploymentDiagnosisService>();

// ── Controllers ──────────────────────────────────
builder.Services.AddControllers();

// ── CORS ─────────────────────────────────────────
// ISSUE #10 FIX: Read allowed origins from config so production domain works.
// In docker-compose: set CORS_ORIGINS=https://yourdomain.com
// Default falls back to localhost for local dev.
var corsOrigins = builder.Configuration["Cors:AllowedOrigins"]
    ?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? ["http://localhost:3000"];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(corsOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ── Swagger / OpenAPI ────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ── Auto-migrate database ────────────────────────
if (app.Environment.IsDevelopment() || app.Configuration.GetValue("OneClick:AutoMigrateDatabase", false))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    var secretBackfill = scope.ServiceProvider.GetRequiredService<SecretBackfillService>();
    await secretBackfill.EncryptLegacyEnvironmentValuesAsync();
}

// ── Middleware Pipeline ──────────────────────────
// ISSUE #11 FIX: Swagger enabled in Development AND Staging for demo,
// but disabled in Production to avoid exposing API schema publicly.
if (!app.Environment.IsProduction())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.Run();

static void ValidateProductionConfiguration(IConfiguration configuration, IWebHostEnvironment environment)
{
    if (environment.IsDevelopment())
        return;

    var placeholderValues = new[]
    {
        "change_me_in_production",
        "super-secret-jwt-key-change-in-production-min-32-chars!!"
    };

    RequireRealValue(configuration["Jwt:Secret"], "Jwt:Secret", placeholderValues);
    RequireRealValue(
        configuration["SecretEncryption:Key"] ?? configuration["ONECLICK_SECRET_KEY"],
        "SecretEncryption:Key or ONECLICK_SECRET_KEY",
        placeholderValues);
    RequireRealValue(configuration.GetConnectionString("DefaultConnection"), "ConnectionStrings:DefaultConnection", placeholderValues);
    RequireRealValue(configuration["Cors:AllowedOrigins"], "Cors:AllowedOrigins", ["http://localhost:3000"]);
}

static void RequireRealValue(string? value, string name, IEnumerable<string> disallowedValues)
{
    if (string.IsNullOrWhiteSpace(value))
        throw new InvalidOperationException($"{name} must be configured outside Development.");

    if (disallowedValues.Any(disallowed => value.Contains(disallowed, StringComparison.OrdinalIgnoreCase)))
        throw new InvalidOperationException($"{name} uses a development placeholder and must be changed outside Development.");
}
