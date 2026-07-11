using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.Exceptions;

namespace OneClickHost.Api.Services;

public class QuotaService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;

    public QuotaService(AppDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    public async Task EnsureCanDeployProjectAsync(Guid userId, Guid currentProjectId)
    {
        await AcquireUserDeploymentLockAsync(userId);

        // Enforce one active project per user.
        // A project is active if its status or any of its services' statuses is in the following list.
        var activeStatuses = new[]
        {
            "queued", "cloning", "building", "deploying", "live", "unhealthy",
            "stopping", "deleting", "deleting_failed", "cleanup_failed"
        };

        var activeProject = await _db.Projects
            .Where(p => p.UserId == userId && p.Id != currentProjectId)
            .Where(p => activeStatuses.Contains(p.Status) || p.Services.Any(s => activeStatuses.Contains(s.Status)))
            .FirstOrDefaultAsync();

        if (activeProject != null)
        {
            throw new QuotaExceededException($"Stop your running project '{activeProject.Name}' before deploying another one.");
        }
    }

    private async Task AcquireUserDeploymentLockAsync(Guid userId)
    {
        if (_db.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) != true)
            return;

        // Transaction-scoped PostgreSQL advisory lock. This serializes the
        // check-plus-queue path for one user without locking unrelated users.
        var lockId = BitConverter.ToInt32(userId.ToByteArray(), 0);
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(1, {0})", lockId);
    }

    public async Task EnsureMaxProjectsAsync(Guid userId)
    {
        var maxProjects = _configuration.GetValue("Quotas:MaxProjectsPerUser", 3);
        var projectCount = await _db.Projects.CountAsync(p => p.UserId == userId);

        if (projectCount >= maxProjects)
        {
            throw new QuotaExceededException($"You have reached the maximum of {maxProjects} projects per user.");
        }
    }

    public async Task EnsureMaxServicesAsync(Guid projectId)
    {
        var maxServices = _configuration.GetValue("Quotas:MaxServicesPerProject", 5);
        var serviceCount = await _db.Services.CountAsync(s => s.ProjectId == projectId);

        if (serviceCount >= maxServices)
        {
            throw new QuotaExceededException($"You have reached the maximum of {maxServices} services per project.");
        }
    }

    public void EnsureComposeLimitsAsync(int routesCount, int envVarsCount)
    {
        var maxRoutes = _configuration.GetValue("Quotas:MaxRoutesPerProject", 10);
        var maxEnvVars = _configuration.GetValue("Quotas:MaxEnvVarsPerProject", 50);

        if (routesCount > maxRoutes)
        {
            throw new QuotaExceededException($"Compose configuration exceeds the maximum of {maxRoutes} routes per project.");
        }

        if (envVarsCount > maxEnvVars)
        {
            throw new QuotaExceededException($"Compose configuration exceeds the maximum of {maxEnvVars} environment variables per project.");
        }
    }

    public async Task EnsureServiceEnvVarsLimitsAsync(Guid projectId, Guid serviceId, int replacementEnvVarsCount)
    {
        var maxEnvVars = _configuration.GetValue("Quotas:MaxEnvVarsPerProject", 50);

        // For service deployment mode, we sum the environment variables across all services in the project.
        var otherServicesEnvVarsCount = await _db.EnvironmentVariables
            .CountAsync(e => e.Service.ProjectId == projectId && e.ServiceId != serviceId && e.Service.Status != "deleting");

        if (otherServicesEnvVarsCount + replacementEnvVarsCount > maxEnvVars)
        {
            throw new QuotaExceededException($"Adding these variables would exceed the maximum of {maxEnvVars} environment variables per project.");
        }
    }
}
