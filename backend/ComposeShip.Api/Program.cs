using System.Text;
using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using ComposeShip.Api.Data;
using ComposeShip.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();

var dataProtectionKeyPath = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(dataProtectionKeyPath))
{
    Directory.CreateDirectory(dataProtectionKeyPath);
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeyPath))
        .SetApplicationName("ComposeShip");
}

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
            },
            OnTokenValidated = async context =>
            {
                var id = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (!Guid.TryParse(id, out var userId))
                {
                    context.Fail("Invalid token subject.");
                    return;
                }

                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                if (await db.Users.AnyAsync(user => user.Id == userId && user.IsDisabled))
                    context.Fail("Account disabled.");
            }
        };
    });

builder.Services.AddAuthorization();

// ── Application Services ─────────────────────────
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<InviteService>();
builder.Services.AddSingleton<CorrelationContext>();
builder.Services.AddSingleton<SecretEncryptionService>();
builder.Services.AddScoped<SecretBackfillService>();
builder.Services.AddScoped<ProjectService>();
builder.Services.AddScoped<ServiceService>();
builder.Services.AddScoped<DeploymentService>();
builder.Services.AddScoped<ExecutionNodeService>();
builder.Services.AddScoped<ProjectEventService>();
builder.Services.AddScoped<AdminRecoveryService>();
builder.Services.AddScoped<QuotaService>();
builder.Services.AddHostedService<ExecutionNodeMonitorService>();
builder.Services.AddHttpClient<IAiDeploymentDiagnosisService, AiDeploymentDiagnosisService>();

// ── Controllers ──────────────────────────────────
builder.Services.AddControllers();

// ── Rate Limiting ────────────────────────────────
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("Auth", context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue<int>("RateLimits:AuthPerMinute", 5),
                Window = TimeSpan.FromMinutes(1)
            });
    });

    options.AddPolicy("InviteRedemption", context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter($"invite:{ip}", _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue<int>("RateLimits:InviteRedemptionPerMinute", 5),
                Window = TimeSpan.FromMinutes(1)
            });
    });

    options.AddPolicy("Deploy", context =>
    {
        var userId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var partitionKey = userId ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue<int>("RateLimits:DeployPerHour", 10),
                Window = TimeSpan.FromHours(1)
            });
    });

    options.AddPolicy("AiDiagnosis", context =>
    {
        var userId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var partitionKey = userId ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue<int>("RateLimits:AiPerHour", 5),
                Window = TimeSpan.FromHours(1)
            });
    });

    options.AddPolicy("ComposeInspect", context =>
    {
        var userId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var partitionKey = userId ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue<int>("RateLimits:ComposeInspectPerMinute", 10),
                Window = TimeSpan.FromMinutes(1)
            });
    });
});


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

if (args.Length == 1 && args[0] == "--migrate")
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<SecretBackfillService>().EncryptLegacyEnvironmentValuesAsync();
    return;
}

if (InviteCli.IsCommand(args))
{
    using var scope = app.Services.CreateScope();
    await InviteCli.RunAsync(args, scope.ServiceProvider.GetRequiredService<InviteService>());
    return;
}

if (AdminRecoveryCli.IsCommand(args))
{
    using var scope = app.Services.CreateScope();
    await AdminRecoveryCli.RunAsync(args, scope.ServiceProvider.GetRequiredService<AdminRecoveryService>());
    return;
}

var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
var trustedProxyNetworks = app.Configuration["ForwardedHeaders:TrustedNetworks"]
    ?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? ["172.16.0.0/12"];
foreach (var cidr in trustedProxyNetworks)
{
    if (!System.Net.IPNetwork.TryParse(cidr, out var network))
        throw new InvalidOperationException($"ForwardedHeaders:TrustedNetworks contains invalid CIDR '{cidr}'.");
    forwardedHeadersOptions.KnownIPNetworks.Add(network);
}
app.UseForwardedHeaders(forwardedHeadersOptions);

app.Use(async (context, next) =>
{
    const string headerName = "X-Correlation-ID";
    var supplied = context.Request.Headers[headerName].FirstOrDefault();
    var correlationId = !string.IsNullOrWhiteSpace(supplied)
        && Regex.IsMatch(supplied, "^[A-Za-z0-9._-]{8,64}$")
        ? supplied
        : Guid.NewGuid().ToString("N");

    var correlation = context.RequestServices.GetRequiredService<CorrelationContext>();
    correlation.Id = correlationId;
    context.Response.Headers[headerName] = correlationId;
    using (app.Logger.BeginScope(new Dictionary<string, object?> { ["correlationId"] = correlationId }))
        await next();
    correlation.Id = null;
});

// ── Auto-migrate database ────────────────────────
if (app.Environment.IsDevelopment() || app.Configuration.GetValue("ComposeShip:AutoMigrateDatabase", false))
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
app.UseRateLimiter();
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
        "super-secret-jwt-key-change-in-production-min-32-chars!!",
        "composeship-dev-invite-code-pepper-minimum-32-chars"
    };

    RequireRealValue(configuration["Jwt:Secret"], "Jwt:Secret", placeholderValues);
    RequireRealValue(
        configuration["SecretEncryption:Key"] ?? configuration["COMPOSESHIP_SECRET_KEY"],
        "SecretEncryption:Key or COMPOSESHIP_SECRET_KEY",
        placeholderValues);
    RequireRealValue(configuration.GetConnectionString("DefaultConnection"), "ConnectionStrings:DefaultConnection", placeholderValues);
    RequireRealValue(configuration["Cors:AllowedOrigins"], "Cors:AllowedOrigins", ["http://localhost:3000"]);
    RequireRealValue(configuration["Invites:CodePepper"], "Invites:CodePepper", placeholderValues);
    RequireRealValue(configuration["ForwardedHeaders:TrustedNetworks"], "ForwardedHeaders:TrustedNetworks", []);
}

static void RequireRealValue(string? value, string name, IEnumerable<string> disallowedValues)
{
    if (string.IsNullOrWhiteSpace(value))
        throw new InvalidOperationException($"{name} must be configured outside Development.");

    if (disallowedValues.Any(disallowed => value.Contains(disallowed, StringComparison.OrdinalIgnoreCase)))
        throw new InvalidOperationException($"{name} uses a development placeholder and must be changed outside Development.");
}
