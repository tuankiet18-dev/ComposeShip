using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.Models;

namespace OneClickHost.Api.Services;

public class ExecutionNodeMonitorService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex SafeFileName = new("[^a-zA-Z0-9.-]+", RegexOptions.Compiled);
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ExecutionNodeMonitorService> _logger;

    public ExecutionNodeMonitorService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<ExecutionNodeMonitorService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(5, _configuration.GetValue("ExecutionNodes:MonitorIntervalSeconds", 30)));
        using var timer = new PeriodicTimer(interval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await MarkOfflineNodesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Execution node monitor failed.");
            }
        }
    }

    private async Task MarkOfflineNodesAsync(CancellationToken cancellationToken)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cutoff = DateTime.UtcNow.AddSeconds(-Math.Max(30, _configuration.GetValue("ExecutionNodes:OfflineAfterSeconds", 180)));
        var now = DateTime.UtcNow;

        var offlineNodes = await db.ExecutionNodes
            .Where(node => node.Status == "active"
                && node.LastHeartbeatAt != null
                && node.LastHeartbeatAt < cutoff)
            .ToListAsync(cancellationToken);

        foreach (var node in offlineNodes)
        {
            node.Status = "offline";
            node.CurrentBuilds = 0;
            node.UpdatedAt = now;

            var activeTargets = await db.RouteTargets
                .Include(target => target.Project)
                .Where(target => target.ExecutionNodeId == node.Id && target.Status == "active")
                .ToListAsync(cancellationToken);

            var affectedProjectIds = activeTargets.Select(target => target.ProjectId).Distinct().ToList();
            foreach (var target in activeTargets)
            {
                target.Status = "offline";
                target.UpdatedAt = now;
                RemoveTraefikRoute(target);
                db.ProjectEvents.Add(new()
                {
                    ProjectId = target.ProjectId,
                    DeploymentId = target.ProjectDeploymentId,
                    ExecutionNodeId = node.Id,
                    RouteTargetId = target.Id,
                    Type = "route.offline",
                    Severity = "warning",
                    Message = $"Route {target.Host} is offline because execution node {node.Name} stopped reporting heartbeat.",
                    MetadataJson = JsonSerializer.Serialize(new Dictionary<string, string>
                    {
                        ["host"] = target.Host,
                        ["targetUrl"] = target.TargetUrl,
                        ["executionNode"] = node.Name
                    }, JsonOptions),
                    CreatedAt = now
                });
            }

            foreach (var projectId in affectedProjectIds)
            {
                var project = activeTargets.First(target => target.ProjectId == projectId).Project;
                project.Status = "unhealthy";
                project.UpdatedAt = now;
                db.ProjectEvents.Add(new()
                {
                    ProjectId = projectId,
                    ExecutionNodeId = node.Id,
                    Type = "node.offline",
                    Severity = "warning",
                    Message = $"Execution node {node.Name} stopped reporting heartbeat.",
                    MetadataJson = JsonSerializer.Serialize(new Dictionary<string, string>
                    {
                        ["executionNode"] = node.Name,
                        ["lastHeartbeatAt"] = node.LastHeartbeatAt?.ToString("O") ?? ""
                    }, JsonOptions),
                    CreatedAt = now
                });
                db.ProjectEvents.Add(new()
                {
                    ProjectId = projectId,
                    ExecutionNodeId = node.Id,
                    Type = "project.unhealthy",
                    Severity = "warning",
                    Message = "Project was marked unhealthy because its active route target is on an offline execution node.",
                    CreatedAt = now
                });
            }
        }

        if (offlineNodes.Count > 0)
            await db.SaveChangesAsync(cancellationToken);
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
}
