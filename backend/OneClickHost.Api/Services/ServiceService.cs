using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Services;
using OneClickHost.Api.Models;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace OneClickHost.Api.Services;

public class ServiceService
{
    private const string SecretMask = "********";
    private static readonly Regex EnvKeyRegex = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);
    private readonly AppDbContext _db;
    private readonly SecretEncryptionService _secrets;

    public ServiceService(AppDbContext db, SecretEncryptionService secrets)
    {
        _db = db;
        _secrets = secrets;
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
                .ThenInclude(d => d.DiagnosticSnapshot)
            .Include(s => s.Deployments.OrderByDescending(d => d.CreatedAt).Take(10))
                .ThenInclude(d => d.AiDiagnosis)
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        return new ServiceDetailResponse(
            service.Id, service.ProjectId, service.Name,
            service.RepoUrl, service.Branch, service.Subfolder,
            service.ServiceType, service.DetectedStack,
            service.NetworkAliases, service.ContainerId,
            service.Status, service.LiveUrl,
            service.EnvironmentVariables.Select(ToEnvVarResponse).ToList(),
            service.Deployments.Select(d => new DeploymentSummary(
                d.Id, d.Status, d.Version,
                d.StartedAt, d.CompletedAt, d.CreatedAt,
                d.DiagnosticSnapshot is not null,
                d.AiDiagnosis is not null
            )).ToList(),
            service.CreatedAt, service.UpdatedAt
        );
    }

    public async Task<ServiceResponse> CreateServiceAsync(Guid projectId, Guid userId, CreateServiceRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId);
        if (!projectExists) throw new KeyNotFoundException("Project not found.");

        var serviceType = request.ServiceType ?? "frontend";
        if (!IsValidServiceType(serviceType))
            throw new ArgumentException($"Invalid service type: {serviceType}");

        if (serviceType is not ("database" or "redis") && string.IsNullOrWhiteSpace(request.RepoUrl))
            throw new ArgumentException("GitHub repository URL is required for frontend and backend services.");

        var serviceName = request.Name.Trim();
        var subfolder = NormalizeRelativePath(request.Subfolder);
        var networkAliases = request.NetworkAliases;
        if (serviceType is "database" or "redis" && string.IsNullOrWhiteSpace(networkAliases))
            networkAliases = ToNetworkAlias(serviceName);

        var service = new Service
        {
            ProjectId = projectId,
            Name = serviceName,
            RepoUrl = serviceType == "database" ? "postgres:16-alpine" : serviceType == "redis" ? "redis:7-alpine" : request.RepoUrl!,
            Branch = serviceType == "database" ? "postgres" : serviceType == "redis" ? "redis" : request.Branch ?? "main",
            Subfolder = serviceType is "database" or "redis" ? null : subfolder,
            ServiceType = serviceType,
            NetworkAliases = networkAliases
        };

        _db.Services.Add(service);

        if (serviceType == "database")
        {
            var dbName = ToDatabaseIdentifier(serviceName);
            service.EnvironmentVariables.Add(new EnvironmentVariable
            {
                Key = "POSTGRES_DB",
                Value = _secrets.Encrypt(dbName),
                IsSecret = false
            });
            service.EnvironmentVariables.Add(new EnvironmentVariable
            {
                Key = "POSTGRES_USER",
                Value = _secrets.Encrypt(dbName),
                IsSecret = false
            });
            service.EnvironmentVariables.Add(new EnvironmentVariable
            {
                Key = "POSTGRES_PASSWORD",
                Value = _secrets.Encrypt(GeneratePassword()),
                IsSecret = true
            });
        }

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

        if (request.ServiceType is not null && !IsValidServiceType(request.ServiceType))
            throw new ArgumentException($"Invalid service type: {request.ServiceType}");

        if (request.Name is not null) service.Name = request.Name.Trim();
        if (request.RepoUrl is not null) service.RepoUrl = request.RepoUrl.Trim();
        if (request.Branch is not null) service.Branch = request.Branch.Trim();
        if (request.Subfolder is not null) service.Subfolder = NormalizeRelativePath(request.Subfolder);
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

    public async Task StopServiceAsync(Guid serviceId, Guid userId)
    {
        var service = await _db.Services
            .Include(s => s.Project)
            .FirstOrDefaultAsync(s => s.Id == serviceId && s.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Service not found.");

        if (service.Status == "deleting")
            throw new ArgumentException("Service is being deleted.");

        if (service.Status == "stopped")
            return;

        service.Status = "stopping";
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

        var normalizedEnvVars = envVars
            .Select(ev => ev with { Key = ev.Key.Trim() })
            .ToList();

        var duplicateKey = normalizedEnvVars
            .GroupBy(ev => ev.Key, StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1)
            ?.Key;
        if (duplicateKey is not null)
            throw new ArgumentException($"Duplicate environment variable key: {duplicateKey}");

        foreach (var ev in normalizedEnvVars)
        {
            if (!EnvKeyRegex.IsMatch(ev.Key))
                throw new ArgumentException($"Invalid environment variable key: {ev.Key}");
        }

        var existingById = service.EnvironmentVariables.ToDictionary(ev => ev.Id);
        var existingByKey = service.EnvironmentVariables.ToDictionary(ev => ev.Key, StringComparer.Ordinal);

        // Remove old env vars and replace with new set. Preserve existing secret
        // values when the client sends back the masked placeholder.
        _db.EnvironmentVariables.RemoveRange(service.EnvironmentVariables);

        foreach (var ev in normalizedEnvVars)
        {
            var value = ev.Value;
            if (ev.IsSecret && IsMaskedSecretValue(value))
            {
                EnvironmentVariable? existing = null;
                if (ev.Id is Guid id)
                    existingById.TryGetValue(id, out existing);
                existing ??= existingByKey.GetValueOrDefault(ev.Key);

                if (existing is not null)
                    value = existing.Value;
            }

            _db.EnvironmentVariables.Add(new EnvironmentVariable
            {
                ServiceId = serviceId,
                Key = ev.Key,
                Value = _secrets.Encrypt(value),
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

        return service.EnvironmentVariables.Select(ToEnvVarResponse).ToList();
    }

    private static bool IsMaskedSecretValue(string value)
    {
        return value == SecretMask || value.Contains('•') || value.Contains("â€¢");
    }

    private EnvVarResponse ToEnvVarResponse(EnvironmentVariable envVar)
    {
        var value = envVar.IsSecret ? SecretMask : _secrets.Decrypt(envVar.Value);
        return new EnvVarResponse(envVar.Id, envVar.Key, value, envVar.IsSecret);
    }

    private static string? NormalizeRelativePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        var raw = path.Trim().Replace('\\', '/');
        if (Path.IsPathRooted(raw) || raw.StartsWith('/') || Regex.IsMatch(raw, "^[A-Za-z]:/"))
            throw new ArgumentException("Service subfolder must be a relative path inside the repository.");

        var normalized = raw.Trim('/');
        if (string.IsNullOrWhiteSpace(normalized))
            return null;
        if (normalized.Split('/').Any(segment => segment is "" or "." or ".."))
            throw new ArgumentException("Service subfolder must be a relative path inside the repository.");

        return normalized;
    }

    private static bool IsValidServiceType(string serviceType)
    {
        return serviceType is "frontend" or "backend" or "database" or "redis";
    }

    private static string ToDatabaseIdentifier(string value)
    {
        var normalized = Regex.Replace(value.ToLowerInvariant(), "[^a-z0-9_]+", "_").Trim('_');
        if (string.IsNullOrWhiteSpace(normalized))
            normalized = "appdb";
        if (char.IsDigit(normalized[0]))
            normalized = $"db_{normalized}";
        return normalized.Length > 40 ? normalized[..40] : normalized;
    }

    private static string ToNetworkAlias(string value)
    {
        var normalized = Regex.Replace(value.ToLowerInvariant(), "[^a-z0-9-]+", "-").Trim('-');
        return string.IsNullOrWhiteSpace(normalized) ? "database" : normalized;
    }

    private static string GeneratePassword()
    {
        var bytes = RandomNumberGenerator.GetBytes(24);
        return Convert.ToBase64String(bytes).Replace("+", "A").Replace("/", "b").TrimEnd('=');
    }
}
