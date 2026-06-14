using System.Text.Json;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.ExecutionNodes;
using OneClickHost.Api.DTOs.Projects;
using OneClickHost.Api.Models;
using YamlDotNet.Serialization;

namespace OneClickHost.Api.Services;

public class ExecutionNodeService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex SafeFileName = new("[^a-zA-Z0-9.-]+", RegexOptions.Compiled);
    private readonly AppDbContext _db;
    private readonly SecretEncryptionService _secrets;
    private readonly IConfiguration _configuration;
    private readonly ProjectEventService _events;

    public ExecutionNodeService(AppDbContext db, SecretEncryptionService secrets, IConfiguration configuration, ProjectEventService events)
    {
        _db = db;
        _secrets = secrets;
        _configuration = configuration;
        _events = events;
    }

    public async Task<ExecutionNodeResponse> RegisterAsync(RegisterExecutionNodeRequest request)
    {
        var registrationToken = _configuration["ExecutionNodes:RegistrationToken"]
            ?? _configuration["EXECUTION_NODE_REGISTRATION_TOKEN"];
        if (string.IsNullOrWhiteSpace(registrationToken) || request.RegistrationToken != registrationToken)
            throw new UnauthorizedAccessException("Invalid execution node registration token.");

        var name = request.Name.Trim();
        var node = await _db.ExecutionNodes.FirstOrDefaultAsync(n => n.Name == name);
        if (node is null)
        {
            node = new ExecutionNode { Name = name };
            _db.ExecutionNodes.Add(node);
        }

        node.PublicOrPrivateBaseUrl = request.PublicOrPrivateBaseUrl.Trim().TrimEnd('/');
        node.Architecture = string.IsNullOrWhiteSpace(request.Architecture) ? "unknown" : request.Architecture.Trim();
        node.LabelsJson = JsonSerializer.Serialize(request.Labels ?? [], JsonOptions);
        node.MaxConcurrentBuilds = Math.Max(1, request.MaxConcurrentBuilds ?? 1);
        node.AgentTokenHash = BCrypt.Net.BCrypt.HashPassword(request.AgentToken);
        node.Status = "active";
        node.LastHeartbeatAt = DateTime.UtcNow;
        node.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await RestoreOfflineRoutesForRecoveredNodeAsync(node);
        return ToNodeResponse(node);
    }

    public async Task<ExecutionNode> AuthenticateAsync(Guid nodeId, string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw new UnauthorizedAccessException("Missing execution node token.");

        var node = await _db.ExecutionNodes.FirstOrDefaultAsync(n => n.Id == nodeId)
            ?? throw new KeyNotFoundException("Execution node not found.");
        if (!BCrypt.Net.BCrypt.Verify(token, node.AgentTokenHash))
            throw new UnauthorizedAccessException("Invalid execution node token.");
        if (node.Status == "disabled")
            throw new InvalidOperationException("Execution node is disabled.");
        return node;
    }

    public async Task<ExecutionNodeResponse> HeartbeatAsync(ExecutionNode node, HeartbeatExecutionNodeRequest request)
    {
        node.CurrentBuilds = Math.Max(0, request.CurrentBuilds);
        if (!string.IsNullOrWhiteSpace(request.Status) && request.Status is "active" or "draining" or "offline")
            node.Status = request.Status;
        node.LastHeartbeatAt = DateTime.UtcNow;
        node.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await RestoreOfflineRoutesForRecoveredNodeAsync(node);
        return ToNodeResponse(node);
    }

    public async Task<LeaseResponse> LeaseAsync(ExecutionNode node, LeaseRequest request)
    {
        UpdateNodeFromLeaseRequest(node, request);
        await RestoreOfflineRoutesForRecoveredNodeAsync(node);
        await RecoverExpiredLeasesAsync();
        if (node.Status != "active")
        {
            await _db.SaveChangesAsync();
            return new LeaseResponse(false, null, null, null);
        }

        var availableSlots = Math.Min(Math.Max(0, request.AvailableSlots), Math.Max(0, node.MaxConcurrentBuilds - node.CurrentBuilds));
        if (availableSlots <= 0)
            return new LeaseResponse(false, null, null, null);

        var now = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync();

        var composeDeployment = await _db.ProjectDeployments
            .Include(d => d.Project)
            .Where(d => d.Status == "queued" && (d.NextRunAt == null || d.NextRunAt <= now) && d.RetryCount < MaxRetries())
            .OrderBy(d => d.CreatedAt)
            .FirstOrDefaultAsync();

        if (composeDeployment is not null)
        {
            List<ComposeEnvVarResponse> environmentVariables;
            try
            {
                environmentVariables = ReadEnvVars(composeDeployment.Project.ComposeEnvJson)
                    .Select(ev => ev with { Value = _secrets.Decrypt(ev.Value) })
                    .ToList();
            }
            catch (Exception ex) when (ex is CryptographicException or FormatException or InvalidOperationException)
            {
                await MarkDeploymentLeasePreparationFailedAsync(composeDeployment, node, now, ex);
                await transaction.CommitAsync();
                return new LeaseResponse(false, null, null, null);
            }

            composeDeployment.Status = "cloning";
            composeDeployment.LockedByNodeId = node.Id;
            composeDeployment.LockedAt = now;
            composeDeployment.HeartbeatAt = now;
            composeDeployment.StartedAt ??= now;
            composeDeployment.Project.Status = "deploying";
            composeDeployment.Project.UpdatedAt = now;
            node.CurrentBuilds += 1;
            node.UpdatedAt = now;
            await _db.SaveChangesAsync();
            await _events.AddAsync(
                composeDeployment.ProjectId,
                "redeploy.started",
                "info",
                $"Deployment v{composeDeployment.Version} started on execution node {node.Name}.",
                composeDeployment.Id,
                node.Id,
                metadata: new Dictionary<string, string>
                {
                    ["executionNode"] = node.Name,
                    ["version"] = composeDeployment.Version.ToString()
                });
            await transaction.CommitAsync();

            var project = composeDeployment.Project;
            return new LeaseResponse(true, "compose", new ComposeLeasePayload(
                composeDeployment.Id,
                project.Id,
                project.Name,
                project.RepoUrl ?? "",
                project.Branch,
                project.Subfolder,
                project.ComposeFile,
                project.ComposeProjectName ?? ToComposeProjectName(project.Id, project.Name),
                ReadRoutes(project.ComposeRoutesJson),
                environmentVariables,
                project.ComposePostStartCommands
            ), null);
        }

        await transaction.CommitAsync();
        return new LeaseResponse(false, null, null, null);
    }

    private async Task MarkDeploymentLeasePreparationFailedAsync(
        ProjectDeployment deployment,
        ExecutionNode node,
        DateTime now,
        Exception ex)
    {
        const string message = "Deployment could not start because stored environment secrets cannot be decrypted. Re-save the Compose configuration or reset the local database with the current ONECLICK_SECRET_KEY.";

        deployment.Status = "failed";
        deployment.ErrorMessage = message;
        deployment.BuildLogs = message;
        deployment.FailureCategory = "configuration_error";
        deployment.CompletedAt = now;
        deployment.HeartbeatAt = now;
        deployment.LockedByNodeId = null;
        deployment.LockedAt = null;
        deployment.Project.Status = "failed";
        deployment.Project.UpdatedAt = now;
        node.CurrentBuilds = Math.Max(0, node.CurrentBuilds);
        node.UpdatedAt = now;

        await _events.AddAsync(
            deployment.ProjectId,
            "redeploy.failed",
            "error",
            message,
            deployment.Id,
            node.Id,
            metadata: new Dictionary<string, string>
            {
                ["failureCategory"] = "configuration_error",
                ["exception"] = ex.GetType().Name
            });
    }

    public async Task RecordEventAsync(ExecutionNode node, Guid deploymentId, DeploymentEventRequest request)
    {
        var now = DateTime.UtcNow;
        if (request.Kind != "compose")
            throw new InvalidOperationException("Only Compose deployment events are enabled for multi-node executor mode.");

        var deployment = await _db.ProjectDeployments
            .Include(d => d.Project)
            .FirstOrDefaultAsync(d => d.Id == deploymentId && d.LockedByNodeId == node.Id)
            ?? throw new KeyNotFoundException("Project deployment not found for this node.");

        deployment.Status = request.Status;
        deployment.BuildLogs = TruncateLog(request.BuildLogs);
        deployment.ErrorMessage = request.ErrorMessage;
        deployment.FailureCategory = request.FailureCategory;
        deployment.HeartbeatAt = now;
        node.LastHeartbeatAt = now;
        if (request.PublicUrls is not null)
            deployment.PublicUrlsJson = JsonSerializer.Serialize(request.PublicUrls, JsonOptions);

        if (request.Status is "live" or "failed" or "stopped")
        {
            deployment.CompletedAt = now;
            node.CurrentBuilds = Math.Max(0, node.CurrentBuilds - 1);
        }

        if (request.Status == "live")
        {
            deployment.Project.Status = "live";
            deployment.Project.ComposeLiveUrlsJson = deployment.PublicUrlsJson;
            await SupersedePreviousProjectDeploymentsAsync(deployment.ProjectId, deployment.Id);
            await _events.AddAsync(
                deployment.ProjectId,
                "redeploy.succeeded",
                "info",
                $"Deployment v{deployment.Version} completed successfully.",
                deployment.Id,
                node.Id,
                metadata: new Dictionary<string, string>
                {
                    ["executionNode"] = node.Name,
                    ["version"] = deployment.Version.ToString()
                });
        }
        else if (request.Status == "failed")
        {
            deployment.Project.Status = "failed";
            await _events.AddAsync(
                deployment.ProjectId,
                "redeploy.failed",
                "error",
                request.ErrorMessage ?? $"Deployment v{deployment.Version} failed.",
                deployment.Id,
                node.Id,
                metadata: new Dictionary<string, string>
                {
                    ["executionNode"] = node.Name,
                    ["version"] = deployment.Version.ToString(),
                    ["failureCategory"] = request.FailureCategory ?? ""
                });
        }

        deployment.Project.UpdatedAt = now;
        node.UpdatedAt = now;
        await _db.SaveChangesAsync();
    }

    public async Task<RouteTargetResponse> UpsertRouteTargetAsync(ExecutionNode node, UpsertRouteTargetRequest request)
    {
        var now = DateTime.UtcNow;
        var activeTargets = await _db.RouteTargets
            .Where(r => r.ProjectId == request.ProjectId && r.Host == request.Host && r.Status == "active")
            .ToListAsync();
        foreach (var target in activeTargets)
        {
            target.Status = "stale";
            target.UpdatedAt = now;
            RemoveTraefikRoute(target);
        }

        var routeTarget = new RouteTarget
        {
            ProjectId = request.ProjectId,
            ProjectDeploymentId = request.ProjectDeploymentId,
            ServiceId = request.ServiceId,
            ExecutionNodeId = node.Id,
            Host = request.Host.Trim().ToLowerInvariant(),
            TargetUrl = request.TargetUrl.Trim(),
            Status = string.IsNullOrWhiteSpace(request.Status) ? "active" : request.Status.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.RouteTargets.Add(routeTarget);
        await _db.SaveChangesAsync();
        foreach (var target in activeTargets)
        {
            await _events.AddAsync(
                target.ProjectId,
                "route.stale",
                "info",
                $"Previous route target for {target.Host} was marked stale.",
                target.ProjectDeploymentId,
                target.ExecutionNodeId,
                target.Id,
                new Dictionary<string, string>
                {
                    ["host"] = target.Host,
                    ["targetUrl"] = target.TargetUrl
                });
        }

        if (routeTarget.Status == "active")
        {
            WriteTraefikRoute(routeTarget);
            await _events.AddAsync(
                routeTarget.ProjectId,
                "route.active",
                "info",
                $"Route {routeTarget.Host} is active on execution node {node.Name}.",
                routeTarget.ProjectDeploymentId,
                node.Id,
                routeTarget.Id,
                new Dictionary<string, string>
                {
                    ["host"] = routeTarget.Host,
                    ["targetUrl"] = routeTarget.TargetUrl,
                    ["executionNode"] = node.Name
                });
        }
        return new RouteTargetResponse(routeTarget.Id, routeTarget.Host, routeTarget.TargetUrl, routeTarget.Status, node.Name, routeTarget.UpdatedAt);
    }

    private static void UpdateNodeFromLeaseRequest(ExecutionNode node, LeaseRequest request)
    {
        node.LastHeartbeatAt = DateTime.UtcNow;
        node.CurrentBuilds = Math.Max(0, request.CurrentBuilds ?? node.CurrentBuilds);
        if (!string.IsNullOrWhiteSpace(request.Status) && request.Status is "active" or "draining" or "offline")
            node.Status = request.Status;
        node.UpdatedAt = DateTime.UtcNow;
    }

    private async Task RestoreOfflineRoutesForRecoveredNodeAsync(ExecutionNode node)
    {
        if (node.Status != "active")
            return;

        var now = DateTime.UtcNow;
        var targets = await _db.RouteTargets
            .Include(r => r.Project)
            .Where(r => r.ExecutionNodeId == node.Id && r.Status == "offline")
            .ToListAsync();

        foreach (var target in targets)
        {
            target.Status = "active";
            target.UpdatedAt = now;
            target.Project.Status = "live";
            target.Project.UpdatedAt = now;
            WriteTraefikRoute(target);
            _db.ProjectEvents.Add(new ProjectEvent
            {
                ProjectId = target.ProjectId,
                DeploymentId = target.ProjectDeploymentId,
                ExecutionNodeId = node.Id,
                RouteTargetId = target.Id,
                Type = "route.active",
                Severity = "info",
                Message = $"Route {target.Host} is active again because execution node {node.Name} recovered.",
                MetadataJson = JsonSerializer.Serialize(new Dictionary<string, string>
                {
                    ["host"] = target.Host,
                    ["targetUrl"] = target.TargetUrl,
                    ["executionNode"] = node.Name,
                    ["source"] = "node-recovered"
                }, JsonOptions),
                CreatedAt = now
            });
        }

        if (targets.Count > 0)
            await _db.SaveChangesAsync();
    }

    private async Task RecoverExpiredLeasesAsync()
    {
        var cutoff = DateTime.UtcNow.AddSeconds(-LeaseTimeoutSeconds());
        var maxRetries = MaxRetries();
        var expired = await _db.ProjectDeployments
            .Include(d => d.Project)
            .Where(d => d.LockedByNodeId != null && d.Status != "live" && d.Status != "failed" && d.HeartbeatAt < cutoff)
            .ToListAsync();

        foreach (var deployment in expired)
        {
            var lockedByNodeId = deployment.LockedByNodeId;
            deployment.RetryCount += 1;
            deployment.LockedByNodeId = null;
            deployment.LockedAt = null;
            deployment.HeartbeatAt = null;
            var exhaustedRetries = deployment.RetryCount >= maxRetries;
            deployment.Status = exhaustedRetries ? "failed" : "queued";
            deployment.FailureCategory = exhaustedRetries ? "platform" : deployment.FailureCategory;
            deployment.NextRunAt = exhaustedRetries ? null : DateTime.UtcNow.AddSeconds(RetryDelaySeconds());
            if (exhaustedRetries)
            {
                deployment.ErrorMessage ??= "Deployment did not start cleanly after multiple lease attempts. Check control-plane API logs and project configuration.";
                deployment.BuildLogs = TruncateLog(string.IsNullOrWhiteSpace(deployment.BuildLogs) ? deployment.ErrorMessage : deployment.BuildLogs);
                deployment.CompletedAt ??= DateTime.UtcNow;
                deployment.Project.Status = "failed";
                _db.ProjectEvents.Add(new ProjectEvent
                {
                    ProjectId = deployment.ProjectId,
                    DeploymentId = deployment.Id,
                    ExecutionNodeId = lockedByNodeId,
                    Type = "redeploy.failed",
                    Severity = "error",
                    Message = deployment.ErrorMessage,
                    MetadataJson = JsonSerializer.Serialize(new Dictionary<string, string>
                    {
                        ["failureCategory"] = "platform",
                        ["retryCount"] = deployment.RetryCount.ToString()
                    }, JsonOptions),
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        if (expired.Count > 0)
            await _db.SaveChangesAsync();
    }

    private async Task SupersedePreviousProjectDeploymentsAsync(Guid projectId, Guid currentDeploymentId)
    {
        await _db.ProjectDeployments
            .Where(d => d.ProjectId == projectId && d.Id != currentDeploymentId && d.Status == "live")
            .ExecuteUpdateAsync(setters => setters.SetProperty(d => d.Status, "superseded"));
    }

    private void WriteTraefikRoute(RouteTarget target)
    {
        var dynamicDir = _configuration["Traefik:DynamicDirectory"]
            ?? _configuration["TRAEFIK_DYNAMIC_DIR"]
            ?? "/etc/traefik/dynamic";
        if (!Directory.Exists(dynamicDir))
            return;

        var routerName = SafeFileName.Replace($"node-{target.Host}", "-").Trim('-');
        var config = new
        {
            http = new
            {
                routers = new Dictionary<string, object>
                {
                    [routerName] = new
                    {
                        rule = $"Host(`{target.Host}`)",
                        service = routerName,
                        entryPoints = new[] { "web" },
                    }
                },
                services = new Dictionary<string, object>
                {
                    [routerName] = new
                    {
                        loadBalancer = new
                        {
                            servers = new[] { new { url = target.TargetUrl } }
                        }
                    }
                }
            }
        };
        var serializer = new SerializerBuilder().Build();
        File.WriteAllText(Path.Combine(dynamicDir, $"{routerName}.yml"), serializer.Serialize(config));
    }

    private void RemoveTraefikRoute(RouteTarget target)
    {
        var dynamicDir = _configuration["Traefik:DynamicDirectory"]
            ?? _configuration["TRAEFIK_DYNAMIC_DIR"]
            ?? "/etc/traefik/dynamic";
        if (!Directory.Exists(dynamicDir))
            return;

        var routerName = SafeFileName.Replace($"node-{target.Host}", "-").Trim('-');
        var path = Path.Combine(dynamicDir, $"{routerName}.yml");
        if (File.Exists(path))
            File.Delete(path);
    }

    private static ExecutionNodeResponse ToNodeResponse(ExecutionNode node) => new(
        node.Id,
        node.Name,
        node.PublicOrPrivateBaseUrl,
        node.Architecture,
        ReadStringList(node.LabelsJson),
        node.Status,
        node.MaxConcurrentBuilds,
        node.CurrentBuilds,
        node.LastHeartbeatAt
    );

    private static List<ComposeRouteResponse> ReadRoutes(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<ComposeRouteResponse>>(json, JsonOptions) ?? [];

    private static List<ComposeEnvVarResponse> ReadEnvVars(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<ComposeEnvVarResponse>>(json, JsonOptions) ?? [];

    private static List<string> ReadStringList(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? [];

    private static string ToComposeProjectName(Guid projectId, string projectName)
    {
        var slug = Regex.Replace(projectName.ToLowerInvariant(), "[^a-z0-9-]+", "-").Trim('-');
        if (string.IsNullOrWhiteSpace(slug))
            slug = "project";
        var value = $"oc-{projectId.ToString("N")[..8]}-{slug}";
        return value.Length > 120 ? value[..120] : value;
    }

    private string? TruncateLog(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return value;
        var maxBytes = _configuration.GetValue("OneClick:LogMaxBytes", 200_000);
        return value.Length <= maxBytes ? value : value[^maxBytes..];
    }

    private int MaxRetries() => _configuration.GetValue("ExecutionNodes:MaxLeaseRetries", 3);
    private int LeaseTimeoutSeconds() => _configuration.GetValue("ExecutionNodes:LeaseTimeoutSeconds", 120);
    private int RetryDelaySeconds() => _configuration.GetValue("ExecutionNodes:RetryDelaySeconds", 30);
}
