using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Services;
using OneClickHost.Api.Models;

namespace OneClickHost.Api.Services;

public class ServiceService
{
    private readonly AppDbContext _db;

    public ServiceService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<ServiceResponse>> GetServicesAsync(Guid projectId, Guid userId)
    {
        // Verify project ownership
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId);
        if (!projectExists) throw new KeyNotFoundException("Project not found.");

        return await _db.Services
            .Where(s => s.ProjectId == projectId)
            .OrderByDescending(s => s.UpdatedAt)
            .Select(s => new ServiceResponse(
                s.Id, s.ProjectId, s.Name, s.RepoUrl, s.Branch,
                s.Subfolder, s.ServiceType, s.DetectedStack,
                s.NetworkAliases, s.Status, s.LiveUrl, s.CreatedAt, s.UpdatedAt))
            .ToListAsync();
    }

    public async Task<ServiceDetailResponse> GetServiceAsync(Guid serviceId, Guid userId)
    {
        var service = await _db.Services
            .Include(s => s.Project)
            .Include(s => s.EnvironmentVariables)
            .Include(s => s.Deployments.OrderByDescending(d => d.CreatedAt).Take(10))
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        return new ServiceDetailResponse(
            service.Id, service.ProjectId, service.Name,
            service.RepoUrl, service.Branch, service.Subfolder,
            service.ServiceType, service.DetectedStack,
            service.NetworkAliases, service.ContainerId,
            service.Status, service.LiveUrl,
            service.EnvironmentVariables.Select(ev => new EnvVarResponse(
                ev.Id, ev.Key,
                ev.IsSecret ? "••••••••" : ev.Value,
                ev.IsSecret
            )).ToList(),
            service.Deployments.Select(d => new DeploymentSummary(
                d.Id, d.Status, d.Version,
                d.StartedAt, d.CompletedAt, d.CreatedAt
            )).ToList(),
            service.CreatedAt, service.UpdatedAt
        );
    }

    public async Task<ServiceResponse> CreateServiceAsync(Guid projectId, Guid userId, CreateServiceRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId);
        if (!projectExists) throw new KeyNotFoundException("Project not found.");

        var service = new Service
        {
            ProjectId = projectId,
            Name = request.Name,
            RepoUrl = request.RepoUrl,
            Branch = request.Branch ?? "main",
            Subfolder = request.Subfolder,
            ServiceType = request.ServiceType ?? "frontend",
            NetworkAliases = request.NetworkAliases
        };

        _db.Services.Add(service);
        await _db.SaveChangesAsync();

        return new ServiceResponse(
            service.Id, service.ProjectId, service.Name,
            service.RepoUrl, service.Branch, service.Subfolder,
            service.ServiceType, service.DetectedStack,
            service.NetworkAliases, service.Status, service.LiveUrl,
            service.CreatedAt, service.UpdatedAt);
    }

    public async Task<ServiceResponse> UpdateServiceAsync(Guid serviceId, Guid userId, UpdateServiceRequest request)
    {
        var service = await _db.Services
            .Include(s => s.Project)
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        if (request.Name is not null) service.Name = request.Name;
        if (request.RepoUrl is not null) service.RepoUrl = request.RepoUrl;
        if (request.Branch is not null) service.Branch = request.Branch;
        if (request.Subfolder is not null) service.Subfolder = request.Subfolder;
        if (request.ServiceType is not null) service.ServiceType = request.ServiceType;
        // Allow clearing aliases by passing empty string; null means "no change"
        if (request.NetworkAliases is not null)
            service.NetworkAliases = request.NetworkAliases == "" ? null : request.NetworkAliases;

        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return new ServiceResponse(
            service.Id, service.ProjectId, service.Name,
            service.RepoUrl, service.Branch, service.Subfolder,
            service.ServiceType, service.DetectedStack,
            service.NetworkAliases, service.Status, service.LiveUrl,
            service.CreatedAt, service.UpdatedAt);
    }

    public async Task DeleteServiceAsync(Guid serviceId, Guid userId)
    {
        var service = await _db.Services
            .Include(s => s.Project)
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        // BUG #8 FIX: Mark as "deleting" so the Worker can cleanup the Docker container
        // and Traefik routing file before the DB record is removed.
        // The Worker polls for services with Status="deleting" and handles cleanup.
        // After cleanup, the Worker (or a follow-up call) removes the DB record.
        service.Status = "deleting";
        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Called after Worker confirms the container is stopped and Traefik config is removed.
    /// Permanently removes the service DB record.
    /// </summary>
    public async Task PermanentlyDeleteServiceAsync(Guid serviceId)
    {
        var service = await _db.Services.FindAsync(serviceId);
        if (service is null) return; // Already deleted

        _db.Services.Remove(service);
        await _db.SaveChangesAsync();
    }

    public async Task UpdateEnvVarsAsync(Guid serviceId, Guid userId, List<EnvVarUpdateRequest> envVars)
    {
        var service = await _db.Services
            .Include(s => s.Project)
            .Include(s => s.EnvironmentVariables)
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        // Remove old env vars and replace with new set
        _db.EnvironmentVariables.RemoveRange(service.EnvironmentVariables);

        foreach (var ev in envVars)
        {
            _db.EnvironmentVariables.Add(new EnvironmentVariable
            {
                ServiceId = serviceId,
                Key = ev.Key,
                Value = ev.Value,
                IsSecret = ev.IsSecret
            });
        }

        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task<List<EnvVarResponse>> GetEnvVarsAsync(Guid serviceId, Guid userId)
    {
        var service = await _db.Services
            .Include(s => s.Project)
            .Include(s => s.EnvironmentVariables)
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        return service.EnvironmentVariables.Select(ev => new EnvVarResponse(
            ev.Id, ev.Key,
            ev.IsSecret ? "••••••••" : ev.Value,
            ev.IsSecret
        )).ToList();
    }
}
