using ComposeShip.Api.DTOs.Projects;

namespace ComposeShip.Api.Services;

public static class ComposeServiceListParser
{
    private static readonly HashSet<string> ServiceNodeTypes = ["service", "database", "cache", "worker", "reverse_proxy"];

    public static List<ComposeServiceResponse> Parse(
        string yamlContent,
        List<ComposeRouteResponse> routes,
        List<ComposeEnvVarResponse> configuredEnvVars,
        string status)
    {
        var graph = DeploymentGraphParser.Parse(yamlContent);
        var serviceNodes = graph.Nodes
            .Where(node => ServiceNodeTypes.Contains(node.Type))
            .OrderBy(node => node.Label)
            .ToList();

        return serviceNodes
            .Select(node => ToComposeService(node, graph.Edges, routes, configuredEnvVars, status))
            .ToList();
    }

    private static ComposeServiceResponse ToComposeService(
        DeploymentGraphNodeResponse node,
        List<DeploymentGraphEdgeResponse> edges,
        List<ComposeRouteResponse> routes,
        List<ComposeEnvVarResponse> configuredEnvVars,
        string status)
    {
        var serviceRoutes = routes
            .Where(route => route.ServiceName.Equals(node.Label, StringComparison.OrdinalIgnoreCase))
            .ToList();
        var envKeys = edges
            .Where(edge => edge.Type == "uses_env" && edge.Source == node.Id)
            .Select(edge => edge.Label)
            .Concat(configuredEnvVars
                .Where(env => string.IsNullOrWhiteSpace(env.ServiceName) || env.ServiceName.Equals(node.Label, StringComparison.OrdinalIgnoreCase))
                .Select(env => env.Key))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value)
            .ToList();

        return new ComposeServiceResponse(
            node.Label,
            node.Type,
            node.Metadata.GetValueOrDefault("image"),
            node.Metadata.GetValueOrDefault("build"),
            node.Metadata.GetValueOrDefault("command"),
            ReadPorts(node.Id, edges, serviceRoutes),
            envKeys,
            ReadTargets(node.Id, edges, "depends_on", "service:"),
            ReadVolumes(node.Id, edges),
            ReadTargets(node.Id, edges, "connects_to", "network:"),
            serviceRoutes,
            serviceRoutes.Count > 0,
            NormalizeStatus(status, serviceRoutes)
        );
    }

    private static List<int> ReadPorts(string serviceId, List<DeploymentGraphEdgeResponse> edges, List<ComposeRouteResponse> routes)
    {
        return edges
            .Where(edge => edge.Type == "exposes" && edge.Source == serviceId)
            .Select(edge => edge.Metadata.TryGetValue("target", out var target) ? target : edge.Label)
            .Select(TryReadPort)
            .Where(port => port is > 0)
            .Select(port => port!.Value)
            .Concat(routes.Select(route => route.InternalPort))
            .Distinct()
            .OrderBy(port => port)
            .ToList();
    }

    private static List<string> ReadTargets(
        string serviceId,
        List<DeploymentGraphEdgeResponse> edges,
        string edgeType,
        string targetPrefix)
    {
        return edges
            .Where(edge => edge.Type == edgeType && edge.Source == serviceId && edge.Target.StartsWith(targetPrefix, StringComparison.Ordinal))
            .Select(edge => edge.Target[targetPrefix.Length..])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value)
            .ToList();
    }

    private static List<string> ReadVolumes(string serviceId, List<DeploymentGraphEdgeResponse> edges)
    {
        return edges
            .Where(edge => edge.Type == "mounts" && edge.Source == serviceId && edge.Target.StartsWith("volume:", StringComparison.Ordinal))
            .Select(edge =>
            {
                var volume = edge.Target["volume:".Length..];
                return edge.Metadata.TryGetValue("target", out var target) ? $"{volume}:{target}" : volume;
            })
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value)
            .ToList();
    }

    private static int? TryReadPort(string value)
    {
        var normalized = value.Split('/')[0].Trim().Trim('"', '\'');
        var segments = normalized.Split(':', StringSplitOptions.RemoveEmptyEntries);
        return int.TryParse(segments.LastOrDefault(), out var port) && port is > 0 and <= 65535
            ? port
            : null;
    }

    private static string NormalizeStatus(string projectStatus, List<ComposeRouteResponse> routes)
    {
        if (projectStatus.Equals("live", StringComparison.OrdinalIgnoreCase))
            return routes.Any(route => !string.IsNullOrWhiteSpace(route.LiveUrl)) ? "live" : "configured";
        if (projectStatus.Equals("queued", StringComparison.OrdinalIgnoreCase)
            || projectStatus.Equals("deploying", StringComparison.OrdinalIgnoreCase)
            || projectStatus.Equals("failed", StringComparison.OrdinalIgnoreCase)
            || projectStatus.Equals("stopped", StringComparison.OrdinalIgnoreCase))
            return projectStatus.ToLowerInvariant();
        return "configured";
    }
}
