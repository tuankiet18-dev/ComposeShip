using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Deployments;
using OneClickHost.Api.Models;
using System.Text.Json;

namespace OneClickHost.Api.Services;

public class DeploymentService
{
    private readonly AppDbContext _db;
    private readonly QuotaService _quotaService;

    public DeploymentService(AppDbContext db, QuotaService quotaService)
    {
        _db = db;
        _quotaService = quotaService;
    }

    public async Task<DeploymentResponse> TriggerDeploymentAsync(Guid serviceId, Guid userId)
    {
        // TODO: enforce AntiAbuse:DeploymentRateLimitPerMinute with ASP.NET Core
        // rate limiting middleware before allowing untrusted multi-user access.
        var service = await _db.Services
            .Include(s => s.Project)
            .Include(s => s.Deployments)
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        // Determine version number
        var latestVersion = service.Deployments.Any()
            ? service.Deployments.Max(d => d.Version)
            : 0;

        var deployment = new Deployment
        {
            ServiceId = serviceId,
            Status = "queued",
            Version = latestVersion + 1
        };

        // BUG #1 FIX: Set service to "queued", NOT "deploying".
        // Only the Worker should set "deploying" when it actually picks up the job.
        // If the Worker crashes before picking up, the service would be stuck at
        // "deploying" forever with no recovery path.
        service.Status = "queued";
        service.UpdatedAt = DateTime.UtcNow;

        _db.Deployments.Add(deployment);

        await using var transaction = await _db.Database.BeginTransactionAsync();
        await _quotaService.EnsureCanDeployProjectAsync(userId, service.ProjectId);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return new DeploymentResponse(
            deployment.Id, deployment.ServiceId, deployment.Status,
            deployment.ImageTag, deployment.ErrorMessage,
            deployment.Version, deployment.StartedAt,
            deployment.CompletedAt, deployment.CreatedAt,
            null, deployment.FailureCategory);
    }

    public async Task<List<DeploymentResponse>> GetDeploymentsAsync(Guid serviceId, Guid userId)
    {
        var serviceExists = await _db.Services
            .AnyAsync(s => s.Id == serviceId && s.Project.UserId == userId);
        if (!serviceExists) throw new KeyNotFoundException("Service not found.");

        return await _db.Deployments
            .Where(d => d.ServiceId == serviceId)
            .OrderByDescending(d => d.CreatedAt)
            .Include(d => d.LockedByNode)
            .Select(d => new DeploymentResponse(
                d.Id, d.ServiceId, d.Status,
                d.ImageTag, d.ErrorMessage,
                d.Version, d.StartedAt,
                d.CompletedAt, d.CreatedAt,
                d.LockedByNode == null ? null : d.LockedByNode.Name,
                d.FailureCategory))
            .ToListAsync();
    }

    public async Task<DeploymentResponse> GetDeploymentAsync(Guid deploymentId, Guid userId)
    {
        var deployment = await _db.Deployments
            .Include(d => d.LockedByNode)
            .Include(d => d.Service)
                .ThenInclude(s => s.Project)
            .FirstOrDefaultAsync(d => d.Id == deploymentId && d.Service.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Deployment not found.");

        return new DeploymentResponse(
            deployment.Id, deployment.ServiceId, deployment.Status,
            deployment.ImageTag, deployment.ErrorMessage,
            deployment.Version, deployment.StartedAt,
            deployment.CompletedAt, deployment.CreatedAt,
            deployment.LockedByNode?.Name, deployment.FailureCategory);
    }

    public async Task<DeploymentLogsResponse> GetDeploymentLogsAsync(Guid deploymentId, Guid userId)
    {
        var deployment = await _db.Deployments
            .Include(d => d.Service)
                .ThenInclude(s => s.Project)
            .FirstOrDefaultAsync(d => d.Id == deploymentId && d.Service.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Deployment not found.");

        return new DeploymentLogsResponse(
            deployment.Id,
            deployment.Status,
            deployment.BuildLogs);
    }

    public async Task<DeploymentDiagnosticSnapshotResponse> GetDeploymentDiagnosticSnapshotAsync(Guid deploymentId, Guid userId)
    {
        var snapshot = await _db.DeploymentDiagnosticSnapshots
            .Include(s => s.Deployment)
                .ThenInclude(d => d.Service)
                    .ThenInclude(s => s.Project)
            .FirstOrDefaultAsync(s =>
                s.DeploymentId == deploymentId &&
                s.Deployment.Service.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Diagnostic snapshot not found.");

        return new DeploymentDiagnosticSnapshotResponse(
            snapshot.DeploymentId,
            snapshot.FailureStep,
            snapshot.DetectedStack,
            snapshot.ErrorSummary,
            snapshot.RelevantLogExcerpt,
            ParseRepositoryTree(snapshot.RepositoryTree),
            ParseSelectedFiles(snapshot.SelectedFiles),
            snapshot.CreatedAt);
    }

    private static IReadOnlyList<RepositoryTreeEntryResponse> ParseRepositoryTree(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];

        try
        {
            return JsonSerializer.Deserialize<List<RepositoryTreeEntryResponse>>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IReadOnlyDictionary<string, string> ParseSelectedFiles(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, string>();

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new Dictionary<string, string>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, string>();
        }
    }
}
