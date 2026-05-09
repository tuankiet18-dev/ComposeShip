using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Deployments;
using OneClickHost.Api.Models;

namespace OneClickHost.Api.Services;

public class DeploymentService
{
    private readonly AppDbContext _db;

    public DeploymentService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<DeploymentResponse> TriggerDeploymentAsync(Guid serviceId, Guid userId)
    {
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
        await _db.SaveChangesAsync();

        return new DeploymentResponse(
            deployment.Id, deployment.ServiceId, deployment.Status,
            deployment.ImageTag, deployment.ErrorMessage,
            deployment.Version, deployment.StartedAt,
            deployment.CompletedAt, deployment.CreatedAt);
    }

    public async Task<List<DeploymentResponse>> GetDeploymentsAsync(Guid serviceId, Guid userId)
    {
        var serviceExists = await _db.Services
            .AnyAsync(s => s.Id == serviceId && s.Project.UserId == userId);
        if (!serviceExists) throw new KeyNotFoundException("Service not found.");

        return await _db.Deployments
            .Where(d => d.ServiceId == serviceId)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new DeploymentResponse(
                d.Id, d.ServiceId, d.Status,
                d.ImageTag, d.ErrorMessage,
                d.Version, d.StartedAt,
                d.CompletedAt, d.CreatedAt))
            .ToListAsync();
    }

    public async Task<DeploymentResponse> GetDeploymentAsync(Guid deploymentId, Guid userId)
    {
        var deployment = await _db.Deployments
            .Include(d => d.Service)
                .ThenInclude(s => s.Project)
            .FirstOrDefaultAsync(d => d.Id == deploymentId && d.Service.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Deployment not found.");

        return new DeploymentResponse(
            deployment.Id, deployment.ServiceId, deployment.Status,
            deployment.ImageTag, deployment.ErrorMessage,
            deployment.Version, deployment.StartedAt,
            deployment.CompletedAt, deployment.CreatedAt);
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
}
