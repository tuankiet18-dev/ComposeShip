using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Projects;
using OneClickHost.Api.Models;
using System.Text.Json;
using System.Text.RegularExpressions;
using YamlDotNet.RepresentationModel;

namespace OneClickHost.Api.Services;

public class ProjectService
{
    private const string SecretMask = "********";
    private const string TraefikExposure = "traefik";
    private const string CloudflareQuickExposure = "cloudflare_quick";
    private static readonly Regex SafeFileName = new("[^a-zA-Z0-9.-]+", RegexOptions.Compiled);
    private static readonly HashSet<string> ComposeExposureProviders = [TraefikExposure, CloudflareQuickExposure];
    private static readonly string[] ComposeFileCandidates = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
    private static readonly HttpClient ComposeHttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(20)
    };
    private static readonly Regex EnvKeyRegex = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    private readonly SecretEncryptionService _secrets;
    private readonly IConfiguration _configuration;
    private readonly ProjectEventService _events;

    public ProjectService(AppDbContext db, SecretEncryptionService secrets, IConfiguration configuration, ProjectEventService events)
    {
        _db = db;
        _secrets = secrets;
        _configuration = configuration;
        _events = events;
    }

    public async Task<List<ProjectResponse>> GetUserProjectsAsync(Guid userId)
    {
        return await _db.Projects
            .Where(p => p.UserId == userId && p.Status != "deleting")
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new ProjectResponse(
                p.Id, p.Name, p.Description,
                p.Status, p.DeploymentMode,
                p.Services.Count,
                p.CreatedAt, p.UpdatedAt))
            .ToListAsync();
    }

    public async Task<ProjectDetailResponse> GetProjectAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .Include(p => p.Services)
            .Include(p => p.ProjectDeployments.OrderByDescending(d => d.CreatedAt).Take(10))
                .ThenInclude(d => d.LockedByNode)
            .Include(p => p.ProjectDeployments.OrderByDescending(d => d.CreatedAt).Take(10))
                .ThenInclude(d => d.RouteTargets)
                    .ThenInclude(r => r.ExecutionNode)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        var stateful = await BuildStatefulMetadataForProjectAsync(project);
        return new ProjectDetailResponse(
            project.Id, project.Name, project.Description, project.Status, project.DeploymentMode,
            ToComposeConfigResponse(project, stateful),
            project.ProjectDeployments.Select(ToProjectDeploymentResponse).ToList(),
            project.Services.Where(s => s.Status != "deleting").Select(s => new ProjectServiceSummary(
                s.Id, s.Name, s.ServiceType, s.ExposureProvider, s.DetectedStack, s.Status, s.LiveUrl
            )).ToList(),
            project.CreatedAt, project.UpdatedAt
        );
    }

    public async Task<ProjectResponse> CreateProjectAsync(Guid userId, CreateProjectRequest request)
    {
        var project = new Project
        {
            UserId = userId,
            Name = request.Name,
            Description = request.Description
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return new ProjectResponse(
            project.Id, project.Name, project.Description, project.Status, project.DeploymentMode,
            0, project.CreatedAt, project.UpdatedAt);
    }

    public async Task<ComposeInspectResponse> InspectComposeAsync(Guid projectId, Guid userId, ComposeInspectRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId);
        if (!projectExists) throw new KeyNotFoundException("Project not found.");

        var branch = string.IsNullOrWhiteSpace(request.Branch) ? "main" : request.Branch.Trim();
        var subfolder = NormalizeRelativePath(request.Subfolder);
        var composeFile = NormalizeRelativePath(request.ComposeFile);
        var (owner, repo, branchFromUrl, subfolderFromUrl) = ParseGitHubRepo(request.RepoUrl);

        if (request.Branch is null && branchFromUrl is not null)
            branch = branchFromUrl;
        if (string.IsNullOrWhiteSpace(subfolder) && subfolderFromUrl is not null)
            subfolder = subfolderFromUrl;

        var (resolvedComposeFile, yamlContent) = await FetchComposeYamlAsync(owner, repo, branch, subfolder, composeFile);

        var services = ParseComposeServices(yamlContent);
        if (services.Count == 0)
            throw new ArgumentException("The compose file does not contain any services.");

        var suggestedRoutes = services
            .Where(service => service.LooksPublic)
            .Select(service => new ComposeRouteResponse(
                service.Name,
                SuggestRouteSlug(service.Name),
                SuggestRoutePort(service.Name, service.Ports),
                TraefikExposure,
                null,
                null
            ))
            .GroupBy(route => route.RouteSlug, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();

        // Environment variables are intentionally not auto-filled. The same
        // key can belong to multiple services with different values, so users
        // should enter them explicitly in the UI.
        return new ComposeInspectResponse(resolvedComposeFile, services, suggestedRoutes, [], DetectStatefulMetadata(yamlContent));
    }

    public async Task<DeploymentGraphResponse> GetDeploymentGraphAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .Include(p => p.RouteTargets.Where(r => r.Status == "active"))
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        if (string.IsNullOrWhiteSpace(project.RepoUrl))
            throw new ArgumentException("Compose repository URL is required before a deployment graph can be built.");

        var branch = string.IsNullOrWhiteSpace(project.Branch) ? "main" : project.Branch.Trim();
        var subfolder = NormalizeRelativePath(project.Subfolder);
        var composeFile = NormalizeRelativePath(project.ComposeFile);
        var (owner, repo, branchFromUrl, subfolderFromUrl) = ParseGitHubRepo(project.RepoUrl);

        if (string.IsNullOrWhiteSpace(project.Branch) && branchFromUrl is not null)
            branch = branchFromUrl;
        if (string.IsNullOrWhiteSpace(subfolder) && subfolderFromUrl is not null)
            subfolder = subfolderFromUrl;

        try
        {
            var (_, yamlContent) = await FetchComposeYamlAsync(owner, repo, branch, subfolder, composeFile);
            return DeploymentGraphParser.Parse(yamlContent);
        }
        catch (ArgumentException)
        {
            return BuildConfiguredDeploymentGraph(project, branch, subfolder, composeFile);
        }
    }

    public async Task<List<ComposeServiceResponse>> GetComposeServicesAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        if (string.IsNullOrWhiteSpace(project.RepoUrl))
            return [];

        var branch = string.IsNullOrWhiteSpace(project.Branch) ? "main" : project.Branch.Trim();
        var subfolder = NormalizeRelativePath(project.Subfolder);
        var composeFile = NormalizeRelativePath(project.ComposeFile);
        var (owner, repo, branchFromUrl, subfolderFromUrl) = ParseGitHubRepo(project.RepoUrl);
        var liveUrls = ReadStringList(project.ComposeLiveUrlsJson);
        var routes = ReadRoutes(project.ComposeRoutesJson)
            .Select(route => route with { LiveUrl = FindRouteLiveUrl(route, liveUrls) })
            .ToList();
        var envVars = ReadEnvVars(project.ComposeEnvJson)
            .Select(ev => ev with { Value = ev.IsSecret ? SecretMask : _secrets.Decrypt(ev.Value) })
            .ToList();

        if (string.IsNullOrWhiteSpace(project.Branch) && branchFromUrl is not null)
            branch = branchFromUrl;
        if (string.IsNullOrWhiteSpace(subfolder) && subfolderFromUrl is not null)
            subfolder = subfolderFromUrl;

        try
        {
            var (_, yamlContent) = await FetchComposeYamlAsync(owner, repo, branch, subfolder, composeFile);
            return ComposeServiceListParser.Parse(yamlContent, routes, envVars, project.Status);
        }
        catch (ArgumentException)
        {
            return BuildConfiguredComposeServices(project, routes, envVars);
        }
    }

    public async Task<ComposeConfigResponse> UpdateComposeConfigAsync(Guid projectId, Guid userId, ComposeConfigRequest request)
    {
        var project = await _db.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        var routes = NormalizeRoutes(request.Routes);
        var envVars = NormalizeEnvVars(request.EnvironmentVariables ?? [], project.ComposeEnvJson);

        project.DeploymentMode = "compose";
        project.RepoUrl = request.RepoUrl.Trim();
        project.Branch = string.IsNullOrWhiteSpace(request.Branch) ? "main" : request.Branch.Trim();
        project.Subfolder = NormalizeRelativePath(request.Subfolder);
        project.ComposeFile = NormalizeRelativePath(request.ComposeFile);
        project.ComposeProjectName = ToComposeProjectName(project.Id, project.Name);
        project.ComposeRoutesJson = JsonSerializer.Serialize(routes, JsonOptions);
        project.ComposeEnvJson = JsonSerializer.Serialize(envVars, JsonOptions);
        if (!string.IsNullOrWhiteSpace(request.PostStartCommands) && !IsPostStartCommandsEnabled())
            throw new ArgumentException("Post-start commands are disabled on this server.");
        project.ComposePostStartCommands = string.IsNullOrWhiteSpace(request.PostStartCommands) ? null : request.PostStartCommands;
        project.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToComposeConfigResponse(project, StatefulUnknown())!;
    }

    public async Task<ProjectDeploymentResponse> TriggerProjectDeploymentAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .Include(p => p.ProjectDeployments)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        if (project.DeploymentMode != "compose")
            throw new ArgumentException("Project is not configured for Compose deployment.");
        if (string.IsNullOrWhiteSpace(project.RepoUrl))
            throw new ArgumentException("Compose repository URL is required.");
        if (ReadRoutes(project.ComposeRoutesJson).Count == 0)
            throw new ArgumentException("At least one public Compose route is required.");

        var wasUnhealthy = project.Status == "unhealthy";
        var latestVersion = project.ProjectDeployments.Any()
            ? project.ProjectDeployments.Max(d => d.Version)
            : 0;

        var deployment = new ProjectDeployment
        {
            ProjectId = project.Id,
            Status = "queued",
            Version = latestVersion + 1,
            ComposeProjectName = project.ComposeProjectName ?? ToComposeProjectName(project.Id, project.Name)
        };

        project.Status = "queued";
        project.UpdatedAt = DateTime.UtcNow;
        _db.ProjectDeployments.Add(deployment);
        await _db.SaveChangesAsync();
        await _events.AddAsync(
            project.Id,
            wasUnhealthy ? "redeploy.requested" : "deploy.requested",
            "info",
            wasUnhealthy
                ? $"Manual redeploy v{deployment.Version} was requested for an unhealthy project."
                : $"Deployment v{deployment.Version} was queued.",
            deployment.Id,
            metadata: new Dictionary<string, string> { ["version"] = deployment.Version.ToString() });

        var stateful = await BuildStatefulMetadataForProjectAsync(project);
        if (stateful.Risk != "none" && stateful.Risk != "unknown")
        {
            await _events.AddAsync(
                project.Id,
                "stateful.warning",
                "warning",
                "This project appears to use local state. Redeploying on another execution node may not restore local data.",
                deployment.Id,
                metadata: new Dictionary<string, string>
                {
                    ["risk"] = stateful.Risk,
                    ["warnings"] = string.Join(" | ", stateful.Warnings)
                });
        }

        return ToProjectDeploymentResponse(deployment);
    }

    public async Task<List<ProjectDeploymentResponse>> GetProjectDeploymentsAsync(Guid projectId, Guid userId)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId);
        if (!projectExists) throw new KeyNotFoundException("Project not found.");

        var deployments = await _db.ProjectDeployments
            .Where(d => d.ProjectId == projectId)
            .Include(d => d.LockedByNode)
            .Include(d => d.RouteTargets)
                .ThenInclude(r => r.ExecutionNode)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync();
        return deployments.Select(ToProjectDeploymentResponse).ToList();
    }

    public async Task<ProjectDeploymentLogsResponse> GetProjectDeploymentLogsAsync(Guid deploymentId, Guid userId)
    {
        var deployment = await _db.ProjectDeployments
            .Include(d => d.Project)
            .FirstOrDefaultAsync(d => d.Id == deploymentId && d.Project.UserId == userId)
            ?? throw new KeyNotFoundException("Project deployment not found.");

        return new ProjectDeploymentLogsResponse(deployment.Id, deployment.Status, deployment.BuildLogs);
    }

    public async Task StopProjectAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        if (project.DeploymentMode != "compose")
            throw new ArgumentException("Project is not configured for Compose deployment.");
        if (project.Status == "stopped")
            return;

        project.Status = "stopping";
        project.UpdatedAt = DateTime.UtcNow;
        MarkActiveRoutesRemoved(project);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteProjectAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .Include(p => p.Services)
            .Include(p => p.RouteTargets.Where(r => r.Status == "active"))
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        // Deletion is asynchronous. The Worker must stop containers and remove
        // Traefik route files before the project row can be safely removed.
        project.Status = "deleting";
        project.ComposeDeleteVolumesOnDelete = true;
        project.UpdatedAt = DateTime.UtcNow;
        foreach (var service in project.Services)
        {
            service.Status = "deleting";
            service.UpdatedAt = DateTime.UtcNow;
        }
        MarkActiveRoutesRemoved(project);

        await _db.SaveChangesAsync();
    }

    private void MarkActiveRoutesRemoved(Project project)
    {
        var now = DateTime.UtcNow;
        foreach (var target in project.RouteTargets.Where(r => r.Status == "active"))
        {
            target.Status = "removed";
            target.UpdatedAt = now;
            RemoveTraefikRoute(target);
            _db.ProjectEvents.Add(new ProjectEvent
            {
                ProjectId = project.Id,
                DeploymentId = target.ProjectDeploymentId,
                ExecutionNodeId = target.ExecutionNodeId,
                RouteTargetId = target.Id,
                Type = "route.removed",
                Severity = "info",
                Message = $"Route {target.Host} was removed from active routing.",
                MetadataJson = JsonSerializer.Serialize(new Dictionary<string, string>
                {
                    ["host"] = target.Host,
                    ["targetUrl"] = target.TargetUrl
                }, JsonOptions),
                CreatedAt = now
            });
        }
    }

    private static List<ComposeRouteResponse> NormalizeRoutes(List<ComposeRouteRequest> routes)
    {
        if (routes.Count == 0)
            return [];

        var normalized = routes.Select(route =>
        {
            var serviceName = route.ServiceName.Trim();
            var routeSlug = ToSlug(route.RouteSlug);
            if (string.IsNullOrWhiteSpace(serviceName))
                throw new ArgumentException("Route service name is required.");
            if (string.IsNullOrWhiteSpace(routeSlug))
                throw new ArgumentException("Route slug is required.");
            if (route.InternalPort is < 1 or > 65535)
                throw new ArgumentException($"Invalid internal port for route '{routeSlug}'.");
            var exposureProvider = string.IsNullOrWhiteSpace(route.ExposureProvider)
                ? TraefikExposure
                : route.ExposureProvider.Trim().ToLowerInvariant();
            if (!ComposeExposureProviders.Contains(exposureProvider))
                throw new ArgumentException($"Unsupported exposure provider for route '{routeSlug}': {route.ExposureProvider}");
            return new ComposeRouteResponse(serviceName, routeSlug, route.InternalPort, exposureProvider, route.HealthPath, null);
        }).ToList();

        var duplicateRoute = normalized
            .GroupBy(route => route.RouteSlug, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(group => group.Count() > 1)?.Key;
        if (duplicateRoute is not null)
            throw new ArgumentException($"Duplicate route slug: {duplicateRoute}");

        return normalized;
    }

    private List<ComposeEnvVarResponse> NormalizeEnvVars(List<ComposeEnvVarRequest> envVars, string? previousJson)
    {
        var previous = ReadEnvVars(previousJson)
            .ToDictionary(ev => $"{ev.ServiceName}:{ev.Key}", StringComparer.Ordinal);

        var normalized = envVars.Select(ev =>
        {
            var serviceName = ev.ServiceName?.Trim() ?? "";
            var key = ev.Key.Trim();
            if (!EnvKeyRegex.IsMatch(key))
                throw new ArgumentException($"Invalid environment variable key: {key}");

            var value = ev.Value;
            if (ev.IsSecret && value == SecretMask && previous.TryGetValue($"{serviceName}:{key}", out var previousEnv))
                value = previousEnv.Value;

            return new ComposeEnvVarResponse(serviceName, key, _secrets.Encrypt(value), ev.IsSecret);
        }).ToList();

        var duplicateKey = normalized
            .GroupBy(ev => $"{ev.ServiceName}:{ev.Key}", StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1)?.Key;
        if (duplicateKey is not null)
            throw new ArgumentException($"Duplicate environment variable: {duplicateKey}");

        return normalized;
    }

    private static List<ComposeServiceSuggestion> ParseComposeServices(string yamlContent)
    {
        var yaml = new YamlStream();
        yaml.Load(new StringReader(yamlContent));
        if (yaml.Documents.Count == 0 || yaml.Documents[0].RootNode is not YamlMappingNode root)
            return [];
        if (!TryGetMapping(root, "services", out var servicesNode))
            return [];

        var services = new List<ComposeServiceSuggestion>();
        foreach (var serviceEntry in servicesNode.Children)
        {
            var serviceName = ((YamlScalarNode)serviceEntry.Key).Value?.Trim();
            if (string.IsNullOrWhiteSpace(serviceName) || serviceEntry.Value is not YamlMappingNode serviceNode)
                continue;

            var image = TryGetScalar(serviceNode, "image");
            var buildContext = TryGetBuildContext(serviceNode);
            var ports = GetPorts(serviceNode).Distinct().ToList();
            var envKeys = GetEnvironmentKeys(serviceNode).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(key => key).ToList();
            var looksPublic = LooksLikePublicService(serviceName, image, ports);

            services.Add(new ComposeServiceSuggestion(serviceName, image, buildContext, ports, envKeys, looksPublic));
        }

        return services;
    }

    private async Task<StatefulMetadataResponse> BuildStatefulMetadataForProjectAsync(Project project)
    {
        if (string.IsNullOrWhiteSpace(project.RepoUrl))
            return StatefulUnknown();

        try
        {
            var branch = string.IsNullOrWhiteSpace(project.Branch) ? "main" : project.Branch.Trim();
            var subfolder = NormalizeRelativePath(project.Subfolder);
            var composeFile = NormalizeRelativePath(project.ComposeFile);
            var (owner, repo, branchFromUrl, subfolderFromUrl) = ParseGitHubRepo(project.RepoUrl);
            if (string.IsNullOrWhiteSpace(project.Branch) && branchFromUrl is not null)
                branch = branchFromUrl;
            if (string.IsNullOrWhiteSpace(subfolder) && subfolderFromUrl is not null)
                subfolder = subfolderFromUrl;

            var (_, yamlContent) = await FetchComposeYamlAsync(owner, repo, branch, subfolder, composeFile);
            return DetectStatefulMetadata(yamlContent);
        }
        catch
        {
            return StatefulUnknown();
        }
    }

    private static StatefulMetadataResponse DetectStatefulMetadata(string yamlContent)
    {
        var warnings = new List<string>();
        var hasDatabase = false;
        var hasVolume = false;

        var yaml = new YamlStream();
        yaml.Load(new StringReader(yamlContent));
        if (yaml.Documents.Count == 0 || yaml.Documents[0].RootNode is not YamlMappingNode root)
            return StatefulUnknown();

        if (TryGetMapping(root, "volumes", out var rootVolumes) && rootVolumes.Children.Count > 0)
        {
            hasVolume = true;
            warnings.Add("Compose defines named volumes. Data in local node volumes may not move to a replacement execution node.");
        }

        if (TryGetMapping(root, "services", out var servicesNode))
        {
            foreach (var serviceEntry in servicesNode.Children)
            {
                var serviceName = ((YamlScalarNode)serviceEntry.Key).Value?.Trim() ?? "";
                if (serviceEntry.Value is not YamlMappingNode serviceNode)
                    continue;

                var image = TryGetScalar(serviceNode, "image") ?? "";
                var serviceDescriptor = $"{serviceName} {image}".ToLowerInvariant();
                if (IsStatefulInfrastructureService(serviceDescriptor))
                {
                    hasDatabase = true;
                    warnings.Add($"Service '{serviceName}' looks like a database/cache service. Use an external managed service for production data.");
                }

                if (TryGetNode(serviceNode, "volumes") is YamlSequenceNode volumes && volumes.Children.Count > 0)
                {
                    hasVolume = true;
                    warnings.Add($"Service '{serviceName}' mounts local or named volumes. Manual redeploy may not restore previous local data.");
                }
            }
        }

        var risk = hasDatabase ? "local_database" : hasVolume ? "local_volume" : "none";
        return new StatefulMetadataResponse(risk, warnings.Distinct().ToList());
    }

    private static StatefulMetadataResponse StatefulUnknown() =>
        new("unknown", ["Stateful risk could not be evaluated for this Compose configuration."]);

    private static bool IsStatefulInfrastructureService(string value) =>
        value.Contains("postgres")
        || value.Contains("mysql")
        || value.Contains("mariadb")
        || value.Contains("redis")
        || value.Contains("mongo")
        || value.Contains("minio");

    private static bool TryGetMapping(YamlMappingNode node, string key, out YamlMappingNode value)
    {
        foreach (var child in node.Children)
        {
            if (((YamlScalarNode)child.Key).Value == key && child.Value is YamlMappingNode mappingNode)
            {
                value = mappingNode;
                return true;
            }
        }

        value = new YamlMappingNode();
        return false;
    }

    private static YamlNode? TryGetNode(YamlMappingNode node, string key)
    {
        foreach (var child in node.Children)
        {
            if (((YamlScalarNode)child.Key).Value == key)
                return child.Value;
        }

        return null;
    }

    private static string? TryGetScalar(YamlMappingNode node, string key) =>
        TryGetNode(node, key) is YamlScalarNode scalar ? scalar.Value : null;

    private static string? TryGetBuildContext(YamlMappingNode serviceNode)
    {
        var buildNode = TryGetNode(serviceNode, "build");
        return buildNode switch
        {
            YamlScalarNode scalar => scalar.Value,
            YamlMappingNode mapping => TryGetScalar(mapping, "context"),
            _ => null
        };
    }

    private static List<int> GetPorts(YamlMappingNode serviceNode)
    {
        var ports = new List<int>();
        foreach (var key in new[] { "ports", "expose" })
        {
            if (TryGetNode(serviceNode, key) is not YamlSequenceNode sequenceNode)
                continue;

            foreach (var item in sequenceNode.Children)
            {
                switch (item)
                {
                    case YamlScalarNode scalar when TryParseComposePort(scalar.Value, out var port):
                        ports.Add(port);
                        break;
                    case YamlMappingNode mapping when TryGetScalar(mapping, "target") is { } target && int.TryParse(target, out var targetPort):
                        ports.Add(targetPort);
                        break;
                }
            }
        }

        return ports;
    }

    private static bool TryParseComposePort(string? value, out int port)
    {
        port = 0;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var normalized = value.Split('/')[0].Trim().Trim('"', '\'');
        var segments = normalized.Split(':', StringSplitOptions.RemoveEmptyEntries);
        var containerPort = segments.LastOrDefault();
        return int.TryParse(containerPort, out port) && port is > 0 and <= 65535;
    }

    private static List<string> GetEnvironmentKeys(YamlMappingNode serviceNode)
    {
        var keys = new List<string>();
        if (TryGetNode(serviceNode, "environment") is not { } environmentNode)
            return keys;

        switch (environmentNode)
        {
            case YamlMappingNode mapping:
                keys.AddRange(mapping.Children.Keys
                    .OfType<YamlScalarNode>()
                    .Select(key => key.Value)
                    .Where(key => !string.IsNullOrWhiteSpace(key))!);
                break;
            case YamlSequenceNode sequence:
                foreach (var item in sequence.Children.OfType<YamlScalarNode>())
                {
                    var raw = item.Value;
                    if (string.IsNullOrWhiteSpace(raw))
                        continue;
                    var key = raw.Split('=', 2)[0].Trim();
                    if (!string.IsNullOrWhiteSpace(key))
                        keys.Add(key);
                }
                break;
        }

        return keys;
    }

    private static (string Owner, string Repo, string? Branch, string? Subfolder) ParseGitHubRepo(string repoUrl)
    {
        if (!Uri.TryCreate(repoUrl.Trim(), UriKind.Absolute, out var uri) || !uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Compose inspection currently supports public GitHub repository URLs.");

        var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length < 2)
            throw new ArgumentException("Invalid GitHub repository URL.");

        var repo = segments[1].EndsWith(".git", StringComparison.OrdinalIgnoreCase)
            ? segments[1][..^4]
            : segments[1];
        string? branch = null;
        string? subfolder = null;

        if (segments.Length > 4 && segments[2] == "tree")
        {
            branch = segments[3];
            subfolder = string.Join('/', segments.Skip(4));
        }

        return (segments[0], repo, branch, subfolder);
    }

    private static async Task<(string ComposeFile, string YamlContent)> FetchComposeYamlAsync(
        string owner,
        string repo,
        string branch,
        string? subfolder,
        string? composeFile)
    {
        var candidatePaths = string.IsNullOrWhiteSpace(composeFile)
            ? ComposeFileCandidates.Select(candidate => (ComposeFile: candidate, RawPath: JoinRepoPath(subfolder, candidate))).ToList()
            : [(ComposeFile: composeFile, RawPath: JoinRepoPath(subfolder, composeFile))];

        foreach (var candidatePath in candidatePaths)
        {
            var url = $"https://raw.githubusercontent.com/{owner}/{repo}/{Uri.EscapeDataString(branch)}/{candidatePath.RawPath}";
            var response = await ComposeHttpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
                continue;

            return (candidatePath.ComposeFile, await response.Content.ReadAsStringAsync());
        }

        throw new ArgumentException("Could not find a compose file in this repository. Set the branch, subfolder, or compose file path and try again.");
    }

    private static string? NormalizeRelativePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        var raw = path.Trim().Replace('\\', '/');
        if (Path.IsPathRooted(raw) || raw.StartsWith('/') || Regex.IsMatch(raw, "^[A-Za-z]:/"))
            throw new ArgumentException("Compose paths must be relative paths inside the repository.");

        var normalized = raw.Trim('/');
        if (string.IsNullOrWhiteSpace(normalized))
            return null;
        if (normalized.Split('/').Any(segment => segment is "" or "." or ".."))
            throw new ArgumentException("Compose paths must be relative paths inside the repository.");

        return normalized;
    }

    private bool IsPostStartCommandsEnabled() =>
        _configuration.GetValue("OneClick:EnablePostStartCommands", false)
        || _configuration.GetValue("ONECLICK_ENABLE_POST_START_COMMANDS", false);

    private static string JoinRepoPath(string? prefix, string path) =>
        string.IsNullOrWhiteSpace(prefix) ? path : $"{prefix.Trim('/')}/{path.Trim('/')}";

    private static bool LooksLikePublicService(string serviceName, string? image, List<int> ports)
    {
        var normalized = serviceName.ToLowerInvariant();
        var imageName = image?.ToLowerInvariant() ?? "";
        if (IsInfrastructureService(normalized, imageName))
            return false;

        return normalized.Contains("frontend")
            || normalized.Contains("client")
            || normalized.Contains("web")
            || normalized.Contains("app")
            || normalized.Contains("api")
            || normalized.Contains("backend")
            || normalized.Contains("server")
            || normalized.Contains("flower")
            || ports.Any(IsLikelyHttpPort);
    }

    private static string SuggestRouteSlug(string serviceName)
    {
        var normalized = serviceName.ToLowerInvariant();
        if (normalized.Contains("frontend") || normalized.Contains("client") || normalized.Contains("web"))
            return "app";
        if (normalized.Contains("api") || normalized.Contains("backend") || normalized.Contains("server"))
            return "api";
        return ToSlug(serviceName);
    }

    private static int SuggestDefaultPort(string serviceName)
    {
        var normalized = serviceName.ToLowerInvariant();
        if (normalized.Contains("flower"))
            return 5555;
        if (normalized.Contains("frontend") || normalized.Contains("client") || normalized.Contains("web"))
            return 3000;
        if (normalized.Contains("api") || normalized.Contains("backend") || normalized.Contains("server"))
            return 8000;
        return 80;
    }

    private static int SuggestRoutePort(string serviceName, List<int> ports)
    {
        var webPort = ports.FirstOrDefault(IsLikelyHttpPort);
        return webPort > 0 ? webPort : SuggestDefaultPort(serviceName);
    }

    private static bool IsLikelyHttpPort(int port) =>
        port is 80 or 443 or 3000 or 3001 or 4173 or 5000 or 5173 or 5555 or 8000 or 8080 or 8081 or 8025;

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

    private static bool IsInfrastructureService(string serviceName, string imageName)
    {
        var value = $"{serviceName} {imageName}";
        return value.Contains("postgres")
            || value.Contains("timescale")
            || value.Contains("redis")
            || value.Contains("mysql")
            || value.Contains("mariadb")
            || value.Contains("mongo")
            || value.Contains("rabbitmq")
            || value.Contains("kafka")
            || value.Contains("celery")
            || serviceName is "db" or "database" or "worker" or "beat" or "queue" or "mailhog" or "smtp";
    }

    private ComposeConfigResponse? ToComposeConfigResponse(Project project, StatefulMetadataResponse? stateful = null)
    {
        if (project.DeploymentMode != "compose" && string.IsNullOrWhiteSpace(project.RepoUrl))
            return null;

        var liveUrls = ReadStringList(project.ComposeLiveUrlsJson);
        var routes = ReadRoutes(project.ComposeRoutesJson).Select(route =>
            route with { LiveUrl = FindRouteLiveUrl(route, liveUrls) }
        ).ToList();

        return new ComposeConfigResponse(
            project.RepoUrl,
            project.Branch,
            project.Subfolder,
            project.ComposeFile,
            project.ComposeProjectName,
            routes,
            ReadEnvVars(project.ComposeEnvJson)
                .Select(ev => ev with { Value = ev.IsSecret ? SecretMask : _secrets.Decrypt(ev.Value) })
                .ToList(),
            project.ComposePostStartCommands,
            liveUrls,
            stateful ?? StatefulUnknown()
        );
    }

    private static ProjectDeploymentResponse ToProjectDeploymentResponse(ProjectDeployment deployment)
    {
        return new ProjectDeploymentResponse(
            deployment.Id,
            deployment.ProjectId,
            deployment.Status,
            deployment.ComposeProjectName,
            ReadStringList(deployment.PublicUrlsJson),
            deployment.ErrorMessage,
            deployment.Version,
            deployment.StartedAt,
            deployment.CompletedAt,
            deployment.CreatedAt,
            deployment.LockedByNode?.Name,
            deployment.FailureCategory,
            deployment.RouteTargets.Select(route => new RouteTargetResponse(
                route.Id,
                route.Host,
                route.TargetUrl,
                route.Status,
                route.ExecutionNode?.Name,
                route.UpdatedAt
            )).ToList()
        );
    }

    private static List<ComposeRouteResponse> ReadRoutes(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];

        var routes = JsonSerializer.Deserialize<List<ComposeRouteResponse>>(json, JsonOptions) ?? [];
        return routes
            .Select(route => route with
            {
                ExposureProvider = string.IsNullOrWhiteSpace(route.ExposureProvider)
                    ? TraefikExposure
                    : route.ExposureProvider
            })
            .ToList();
    }

    private static List<ComposeEnvVarResponse> ReadEnvVars(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<ComposeEnvVarResponse>>(json, JsonOptions) ?? [];

    private static List<string> ReadStringList(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? [];

    private DeploymentGraphResponse BuildConfiguredDeploymentGraph(Project project, string branch, string? subfolder, string? composeFile)
    {
        var nodes = new List<DeploymentGraphNodeResponse>();
        var edges = new List<DeploymentGraphEdgeResponse>();
        var routes = ReadRoutes(project.ComposeRoutesJson);
        var envVars = ReadEnvVars(project.ComposeEnvJson);
        var serviceNames = routes.Select(route => route.ServiceName)
            .Concat(envVars.Select(env => env.ServiceName))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .DefaultIfEmpty(ToSlug(project.Name) is { Length: > 0 } slug ? slug : "app")
            .ToList();

        foreach (var serviceName in serviceNames)
        {
            var serviceId = $"service:{serviceName}";
            nodes.Add(new DeploymentGraphNodeResponse(
                serviceId,
                "service",
                serviceName,
                new Dictionary<string, string>
                {
                    ["repoUrl"] = project.RepoUrl ?? "",
                    ["branch"] = branch,
                    ["subfolder"] = subfolder ?? "",
                    ["composeFile"] = composeFile ?? "",
                    ["containerization"] = "generated Dockerfile",
                    ["source"] = "saved project config"
                }));
        }

        if (routes.Count > 0)
        {
            var publicNetworkId = "network:public";
            nodes.Add(new DeploymentGraphNodeResponse(
                publicNetworkId,
                "network",
                "public",
                new Dictionary<string, string> { ["scope"] = "external" }));

            foreach (var route in routes)
            {
                var metadata = new Dictionary<string, string>
                {
                    ["slug"] = route.RouteSlug,
                    ["target"] = route.InternalPort.ToString(),
                    ["provider"] = route.ExposureProvider
                };
                if (!string.IsNullOrWhiteSpace(route.HealthPath))
                    metadata["healthPath"] = route.HealthPath;
                edges.Add(new DeploymentGraphEdgeResponse(
                    $"exposes:service:{route.ServiceName}:network:public:{route.RouteSlug}",
                    "exposes",
                    $"service:{route.ServiceName}",
                    publicNetworkId,
                    route.RouteSlug,
                    metadata));
            }
        }

        foreach (var envVar in envVars)
        {
            var serviceName = string.IsNullOrWhiteSpace(envVar.ServiceName) ? serviceNames[0] : envVar.ServiceName;
            var envId = $"env:{serviceName}:{envVar.Key}";
            nodes.Add(new DeploymentGraphNodeResponse(
                envId,
                "env_var",
                envVar.Key,
                new Dictionary<string, string>
                {
                    ["service"] = serviceName,
                    ["value"] = envVar.IsSecret ? SecretMask : _secrets.Decrypt(envVar.Value)
                }));
            edges.Add(new DeploymentGraphEdgeResponse(
                $"uses_env:service:{serviceName}:{envId}",
                "uses_env",
                $"service:{serviceName}",
                envId,
                envVar.Key,
                []));
        }

        nodes.Add(new DeploymentGraphNodeResponse(
            "network:oneclick-runtime",
            "network",
            "oneclick runtime",
            new Dictionary<string, string> { ["scope"] = "internal" }));
        foreach (var serviceName in serviceNames)
        {
            edges.Add(new DeploymentGraphEdgeResponse(
                $"connects_to:service:{serviceName}:network:oneclick-runtime",
                "connects_to",
                $"service:{serviceName}",
                "network:oneclick-runtime",
                "oneclick runtime",
                []));
        }

        return new DeploymentGraphResponse(
            nodes.GroupBy(node => node.Id).Select(group => group.First()).ToList(),
            edges.GroupBy(edge => edge.Id).Select(group => group.First()).ToList());
    }

    private static List<ComposeServiceResponse> BuildConfiguredComposeServices(
        Project project,
        List<ComposeRouteResponse> routes,
        List<ComposeEnvVarResponse> envVars)
    {
        var serviceNames = routes.Select(route => route.ServiceName)
            .Concat(envVars.Select(env => env.ServiceName))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .DefaultIfEmpty(ToSlug(project.Name) is { Length: > 0 } slug ? slug : "app")
            .ToList();

        return serviceNames.Select(serviceName =>
        {
            var serviceRoutes = routes
                .Where(route => route.ServiceName.Equals(serviceName, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var serviceEnvKeys = envVars
                .Where(env => string.IsNullOrWhiteSpace(env.ServiceName) || env.ServiceName.Equals(serviceName, StringComparison.OrdinalIgnoreCase))
                .Select(env => env.Key)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(key => key)
                .ToList();

            return new ComposeServiceResponse(
                serviceName,
                "service",
                null,
                null,
                null,
                serviceRoutes.Select(route => route.InternalPort).Distinct().OrderBy(port => port).ToList(),
                serviceEnvKeys,
                [],
                [],
                ["oneclick-runtime"],
                serviceRoutes,
                serviceRoutes.Count > 0,
                ToConfiguredComposeServiceStatus(project.Status, serviceRoutes)
            );
        }).ToList();
    }

    private static string ToConfiguredComposeServiceStatus(string projectStatus, List<ComposeRouteResponse> routes)
    {
        if (projectStatus.Equals("live", StringComparison.OrdinalIgnoreCase))
            return routes.Any(route => !string.IsNullOrWhiteSpace(route.LiveUrl)) ? "live" : "configured";
        if (projectStatus.Equals("queued", StringComparison.OrdinalIgnoreCase)
            || projectStatus.Equals("deploying", StringComparison.OrdinalIgnoreCase)
            || projectStatus.Equals("failed", StringComparison.OrdinalIgnoreCase)
            || projectStatus.Equals("unhealthy", StringComparison.OrdinalIgnoreCase)
            || projectStatus.Equals("stopped", StringComparison.OrdinalIgnoreCase))
            return projectStatus.ToLowerInvariant();
        return "configured";
    }

    private static string? FindRouteLiveUrl(ComposeRouteResponse route, List<string> liveUrls)
    {
        var directUrl = liveUrls.FirstOrDefault(url => url.Contains($"{route.RouteSlug}-", StringComparison.OrdinalIgnoreCase));
        if (directUrl is not null)
            return directUrl;
        if (route.ExposureProvider == CloudflareQuickExposure)
        {
            var quickUrls = liveUrls.Where(url => url.Contains(".trycloudflare.com", StringComparison.OrdinalIgnoreCase)).ToList();
            if (quickUrls.Count == 1)
                return quickUrls[0];
        }
        return null;
    }

    private static string ToComposeProjectName(Guid projectId, string projectName)
    {
        var slug = ToSlug(projectName);
        if (string.IsNullOrWhiteSpace(slug))
            slug = "project";
        var value = $"oc-{projectId.ToString("N")[..8]}-{slug}";
        return value.Length > 120 ? value[..120] : value;
    }

    private static string ToSlug(string value)
    {
        return Regex.Replace(value.ToLowerInvariant(), "[^a-z0-9-]+", "-").Trim('-');
    }
}
