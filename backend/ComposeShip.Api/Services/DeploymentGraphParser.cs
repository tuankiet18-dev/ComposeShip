using System.Text.RegularExpressions;
using ComposeShip.Api.DTOs.Projects;
using YamlDotNet.RepresentationModel;

namespace ComposeShip.Api.Services;

public static class DeploymentGraphParser
{
    private static readonly Regex EnvKeyRegex = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

    public static DeploymentGraphResponse Parse(string yamlContent)
    {
        var yaml = new YamlStream();
        yaml.Load(new StringReader(yamlContent));
        if (yaml.Documents.Count == 0 || yaml.Documents[0].RootNode is not YamlMappingNode root)
            return new DeploymentGraphResponse([], []);
        if (!TryGetMapping(root, "services", out var servicesNode) || servicesNode.Children.Count == 0)
            return new DeploymentGraphResponse([], []);

        var nodes = new Dictionary<string, DeploymentGraphNodeResponse>(StringComparer.Ordinal);
        var edges = new Dictionary<string, DeploymentGraphEdgeResponse>(StringComparer.Ordinal);
        var serviceNames = servicesNode.Children.Keys
            .OfType<YamlScalarNode>()
            .Select(key => key.Value?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        AddTopLevelVolumes(root, nodes);
        AddTopLevelNetworks(root, nodes);

        foreach (var serviceEntry in servicesNode.Children)
        {
            var serviceName = (serviceEntry.Key as YamlScalarNode)?.Value?.Trim();
            if (string.IsNullOrWhiteSpace(serviceName) || serviceEntry.Value is not YamlMappingNode serviceNode)
                continue;

            var serviceId = ServiceId(serviceName);
            AddNode(nodes, serviceId, ClassifyService(serviceName, serviceNode), serviceName, ServiceMetadata(serviceNode));

            AddDependsOnEdges(serviceName, serviceNode, serviceNames, edges);
            AddEnvironmentNodes(serviceName, serviceNode, serviceNames, nodes, edges);
            AddVolumeEdges(serviceName, serviceNode, nodes, edges);
            AddNetworkEdges(serviceName, serviceNode, nodes, edges);
            AddExposureEdges(serviceName, serviceNode, nodes, edges);
            AddLinkEdges(serviceName, serviceNode, serviceNames, edges);
        }

        return new DeploymentGraphResponse(
            nodes.Values.OrderBy(node => node.Type).ThenBy(node => node.Label).ToList(),
            edges.Values.OrderBy(edge => edge.Type).ThenBy(edge => edge.Source).ThenBy(edge => edge.Target).ToList()
        );
    }

    private static void AddTopLevelVolumes(YamlMappingNode root, Dictionary<string, DeploymentGraphNodeResponse> nodes)
    {
        if (!TryGetMapping(root, "volumes", out var volumesNode))
            return;

        foreach (var entry in volumesNode.Children)
        {
            var name = (entry.Key as YamlScalarNode)?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(name))
                AddNode(nodes, VolumeId(name), "volume", name, []);
        }
    }

    private static void AddTopLevelNetworks(YamlMappingNode root, Dictionary<string, DeploymentGraphNodeResponse> nodes)
    {
        if (!TryGetMapping(root, "networks", out var networksNode))
            return;

        foreach (var entry in networksNode.Children)
        {
            var name = (entry.Key as YamlScalarNode)?.Value?.Trim();
            if (!string.IsNullOrWhiteSpace(name))
                AddNode(nodes, NetworkId(name), "network", name, []);
        }
    }

    private static void AddDependsOnEdges(
        string serviceName,
        YamlMappingNode serviceNode,
        HashSet<string> serviceNames,
        Dictionary<string, DeploymentGraphEdgeResponse> edges)
    {
        foreach (var dependency in ReadDependencyNames(TryGetNode(serviceNode, "depends_on")))
        {
            if (serviceNames.Contains(dependency))
                AddEdge(edges, "depends_on", ServiceId(serviceName), ServiceId(dependency), dependency, []);
        }
    }

    private static void AddEnvironmentNodes(
        string serviceName,
        YamlMappingNode serviceNode,
        HashSet<string> serviceNames,
        Dictionary<string, DeploymentGraphNodeResponse> nodes,
        Dictionary<string, DeploymentGraphEdgeResponse> edges)
    {
        foreach (var envVar in ReadEnvironment(TryGetNode(serviceNode, "environment")))
        {
            var envId = EnvId(serviceName, envVar.Key);
            var metadata = new Dictionary<string, string>
            {
                ["service"] = serviceName,
                ["key"] = envVar.Key
            };
            if (envVar.Value is not null)
                metadata["value"] = IsSensitiveKey(envVar.Key) ? "********" : envVar.Value;

            AddNode(nodes, envId, "env_var", envVar.Key, metadata);
            AddEdge(edges, "uses_env", ServiceId(serviceName), envId, envVar.Key, []);

            if (envVar.Value is null)
                continue;
            foreach (var targetService in serviceNames.Where(name => !name.Equals(serviceName, StringComparison.OrdinalIgnoreCase)))
            {
                if (ReferencesService(envVar.Value, targetService))
                    AddEdge(edges, "connects_to", ServiceId(serviceName), ServiceId(targetService), targetService, new()
                    {
                        ["via"] = envVar.Key
                    });
            }
        }

        foreach (var envFile in ReadScalarList(TryGetNode(serviceNode, "env_file")))
        {
            var envId = EnvId(serviceName, envFile);
            AddNode(nodes, envId, "env_var", envFile, new()
            {
                ["service"] = serviceName,
                ["source"] = "env_file"
            });
            AddEdge(edges, "uses_env", ServiceId(serviceName), envId, envFile, []);
        }
    }

    private static void AddVolumeEdges(
        string serviceName,
        YamlMappingNode serviceNode,
        Dictionary<string, DeploymentGraphNodeResponse> nodes,
        Dictionary<string, DeploymentGraphEdgeResponse> edges)
    {
        foreach (var mount in ReadVolumes(TryGetNode(serviceNode, "volumes")))
        {
            var volumeId = VolumeId(mount.Source);
            var metadata = new Dictionary<string, string>();
            if (!string.IsNullOrWhiteSpace(mount.Target))
                metadata["target"] = mount.Target;
            if (!string.IsNullOrWhiteSpace(mount.Mode))
                metadata["mode"] = mount.Mode;

            AddNode(nodes, volumeId, "volume", mount.Source, metadata);
            AddEdge(edges, "mounts", ServiceId(serviceName), volumeId, mount.Target ?? mount.Source, metadata);
        }
    }

    private static void AddNetworkEdges(
        string serviceName,
        YamlMappingNode serviceNode,
        Dictionary<string, DeploymentGraphNodeResponse> nodes,
        Dictionary<string, DeploymentGraphEdgeResponse> edges)
    {
        var networks = ReadNetworkNames(TryGetNode(serviceNode, "networks"));
        if (networks.Count == 0)
            networks.Add("default");

        foreach (var network in networks)
        {
            var networkId = NetworkId(network);
            AddNode(nodes, networkId, "network", network, []);
            AddEdge(edges, "connects_to", ServiceId(serviceName), networkId, network, []);
        }
    }

    private static void AddExposureEdges(
        string serviceName,
        YamlMappingNode serviceNode,
        Dictionary<string, DeploymentGraphNodeResponse> nodes,
        Dictionary<string, DeploymentGraphEdgeResponse> edges)
    {
        foreach (var port in ReadPorts(TryGetNode(serviceNode, "ports")))
        {
            var publicId = NetworkId("public");
            AddNode(nodes, publicId, "network", "public", new() { ["scope"] = "external" });
            AddEdge(edges, "exposes", ServiceId(serviceName), publicId, port.Label, port.Metadata);
        }

        foreach (var port in ReadPorts(TryGetNode(serviceNode, "expose")))
        {
            var networkId = NetworkId("default");
            AddNode(nodes, networkId, "network", "default", []);
            AddEdge(edges, "exposes", ServiceId(serviceName), networkId, port.Label, port.Metadata);
        }
    }

    private static void AddLinkEdges(
        string serviceName,
        YamlMappingNode serviceNode,
        HashSet<string> serviceNames,
        Dictionary<string, DeploymentGraphEdgeResponse> edges)
    {
        foreach (var link in ReadScalarList(TryGetNode(serviceNode, "links")))
        {
            var target = link.Split(':', 2)[0].Trim();
            if (serviceNames.Contains(target))
                AddEdge(edges, "connects_to", ServiceId(serviceName), ServiceId(target), target, new() { ["via"] = "links" });
        }
    }

    private static string ClassifyService(string serviceName, YamlMappingNode serviceNode)
    {
        var image = TryGetScalar(serviceNode, "image") ?? "";
        var command = ReadCommand(serviceNode);
        var value = $"{serviceName} {image} {command}".ToLowerInvariant();

        if (value.Contains("traefik") || value.Contains("caddy") || value.Contains("reverse-proxy") || serviceName.Equals("proxy", StringComparison.OrdinalIgnoreCase))
            return "reverse_proxy";
        if (value.Contains("postgres") || value.Contains("mysql") || value.Contains("mariadb") || value.Contains("mongo") || value.Contains("database") || serviceName.Equals("db", StringComparison.OrdinalIgnoreCase))
            return "database";
        if (value.Contains("redis") || value.Contains("memcached") || serviceName.Equals("cache", StringComparison.OrdinalIgnoreCase))
            return "cache";
        if (value.Contains("celery") || value.Contains("rq worker") || value.Contains("sidekiq") || serviceName.Contains("worker", StringComparison.OrdinalIgnoreCase) || serviceName.Equals("beat", StringComparison.OrdinalIgnoreCase))
            return "worker";
        return "service";
    }

    private static Dictionary<string, string> ServiceMetadata(YamlMappingNode serviceNode)
    {
        var metadata = new Dictionary<string, string>();
        if (TryGetScalar(serviceNode, "image") is { } image)
            metadata["image"] = image;
        if (TryGetBuildContext(serviceNode) is { } buildContext)
            metadata["build"] = buildContext;
        if (ReadCommand(serviceNode) is { Length: > 0 } command)
            metadata["command"] = command;
        return metadata;
    }

    private static List<string> ReadDependencyNames(YamlNode? node) =>
        node switch
        {
            YamlSequenceNode sequence => CleanScalars(sequence.Children.OfType<YamlScalarNode>()).ToList(),
            YamlMappingNode mapping => CleanScalars(mapping.Children.Keys.OfType<YamlScalarNode>()).ToList(),
            YamlScalarNode scalar when !string.IsNullOrWhiteSpace(scalar.Value) => [scalar.Value.Trim()],
            _ => []
        };

    private static List<(string Key, string? Value)> ReadEnvironment(YamlNode? node)
    {
        var values = new List<(string Key, string? Value)>();
        switch (node)
        {
            case YamlMappingNode mapping:
                foreach (var entry in mapping.Children)
                {
                    var key = (entry.Key as YamlScalarNode)?.Value?.Trim();
                    if (string.IsNullOrWhiteSpace(key) || !EnvKeyRegex.IsMatch(key))
                        continue;
                    values.Add((key, (entry.Value as YamlScalarNode)?.Value));
                }
                break;
            case YamlSequenceNode sequence:
                foreach (var item in sequence.Children.OfType<YamlScalarNode>())
                {
                    var raw = item.Value?.Trim();
                    if (string.IsNullOrWhiteSpace(raw))
                        continue;
                    var parts = raw.Split('=', 2);
                    var key = parts[0].Trim();
                    if (!EnvKeyRegex.IsMatch(key))
                        continue;
                    values.Add((key, parts.Length == 2 ? parts[1] : null));
                }
                break;
        }
        return values;
    }

    private static List<(string Source, string? Target, string? Mode)> ReadVolumes(YamlNode? node)
    {
        var volumes = new List<(string Source, string? Target, string? Mode)>();
        if (node is not YamlSequenceNode sequence)
            return volumes;

        foreach (var item in sequence.Children)
        {
            switch (item)
            {
                case YamlScalarNode scalar when !string.IsNullOrWhiteSpace(scalar.Value):
                    var parts = scalar.Value.Split(':', 3);
                    var source = parts[0].Trim();
                    if (string.IsNullOrWhiteSpace(source) && parts.Length > 1)
                        source = parts[1].Trim();
                    if (!string.IsNullOrWhiteSpace(source))
                        volumes.Add((source, parts.Length > 1 ? parts[1].Trim() : null, parts.Length > 2 ? parts[2].Trim() : null));
                    break;
                case YamlMappingNode mapping:
                    var mappedSource = TryGetScalar(mapping, "source") ?? TryGetScalar(mapping, "src");
                    var mappedTarget = TryGetScalar(mapping, "target") ?? TryGetScalar(mapping, "dst") ?? TryGetScalar(mapping, "destination");
                    if (!string.IsNullOrWhiteSpace(mappedSource))
                        volumes.Add((mappedSource.Trim(), mappedTarget?.Trim(), TryGetScalar(mapping, "read_only") == "true" ? "ro" : null));
                    break;
            }
        }

        return volumes;
    }

    private static List<string> ReadNetworkNames(YamlNode? node) =>
        node switch
        {
            YamlSequenceNode sequence => CleanScalars(sequence.Children.OfType<YamlScalarNode>()).ToList(),
            YamlMappingNode mapping => CleanScalars(mapping.Children.Keys.OfType<YamlScalarNode>()).ToList(),
            YamlScalarNode scalar when !string.IsNullOrWhiteSpace(scalar.Value) => [scalar.Value.Trim()],
            _ => []
        };

    private static List<(string Label, Dictionary<string, string> Metadata)> ReadPorts(YamlNode? node)
    {
        var ports = new List<(string Label, Dictionary<string, string> Metadata)>();
        if (node is not YamlSequenceNode sequence)
            return ports;

        foreach (var item in sequence.Children)
        {
            switch (item)
            {
                case YamlScalarNode scalar when !string.IsNullOrWhiteSpace(scalar.Value):
                    var value = scalar.Value.Trim();
                    ports.Add((value, ParsePortMetadata(value)));
                    break;
                case YamlMappingNode mapping:
                    var target = TryGetScalar(mapping, "target") ?? "";
                    var published = TryGetScalar(mapping, "published");
                    var protocol = TryGetScalar(mapping, "protocol");
                    var label = string.IsNullOrWhiteSpace(published) ? target : $"{published}:{target}";
                    var metadata = new Dictionary<string, string>();
                    if (!string.IsNullOrWhiteSpace(target))
                        metadata["target"] = target;
                    if (!string.IsNullOrWhiteSpace(published))
                        metadata["published"] = published;
                    if (!string.IsNullOrWhiteSpace(protocol))
                        metadata["protocol"] = protocol;
                    if (!string.IsNullOrWhiteSpace(label))
                        ports.Add((label, metadata));
                    break;
            }
        }
        return ports;
    }

    private static Dictionary<string, string> ParsePortMetadata(string value)
    {
        var metadata = new Dictionary<string, string>();
        var normalized = value.Split('/')[0].Trim();
        var protocolParts = value.Split('/', 2);
        if (protocolParts.Length == 2)
            metadata["protocol"] = protocolParts[1];
        var segments = normalized.Split(':', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 1)
            metadata["target"] = segments[0];
        else if (segments.Length >= 2)
        {
            metadata["published"] = segments[^2];
            metadata["target"] = segments[^1];
        }
        return metadata;
    }

    private static List<string> ReadScalarList(YamlNode? node) =>
        node switch
        {
            YamlSequenceNode sequence => CleanScalars(sequence.Children.OfType<YamlScalarNode>()).ToList(),
            YamlScalarNode scalar when !string.IsNullOrWhiteSpace(scalar.Value) => [scalar.Value.Trim()],
            _ => []
        };

    private static string ReadCommand(YamlMappingNode serviceNode) =>
        TryGetNode(serviceNode, "command") switch
        {
            YamlScalarNode scalar => scalar.Value ?? "",
            YamlSequenceNode sequence => string.Join(" ", sequence.Children.OfType<YamlScalarNode>().Select(scalar => scalar.Value)),
            _ => ""
        };

    private static bool TryGetMapping(YamlMappingNode node, string key, out YamlMappingNode value)
    {
        foreach (var child in node.Children)
        {
            if ((child.Key as YamlScalarNode)?.Value == key && child.Value is YamlMappingNode mappingNode)
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
            if ((child.Key as YamlScalarNode)?.Value == key)
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

    private static bool ReferencesService(string value, string serviceName) =>
        Regex.IsMatch(value, $@"(^|[^A-Za-z0-9_-]){Regex.Escape(serviceName)}([^A-Za-z0-9_-]|$)", RegexOptions.IgnoreCase);

    private static bool IsSensitiveKey(string key)
    {
        var normalized = key.ToLowerInvariant();
        return normalized.Contains("password") || normalized.Contains("secret") || normalized.Contains("token") || normalized.Contains("api_key") || normalized.EndsWith("_key");
    }

    private static void AddNode(Dictionary<string, DeploymentGraphNodeResponse> nodes, string id, string type, string label, Dictionary<string, string> metadata)
    {
        if (!nodes.ContainsKey(id))
            nodes[id] = new DeploymentGraphNodeResponse(id, type, label, metadata);
    }

    private static void AddEdge(Dictionary<string, DeploymentGraphEdgeResponse> edges, string type, string source, string target, string label, Dictionary<string, string> metadata)
    {
        var id = $"{type}:{source}:{target}:{label}";
        if (!edges.ContainsKey(id))
            edges[id] = new DeploymentGraphEdgeResponse(id, type, source, target, label, metadata);
    }

    private static string ServiceId(string name) => $"service:{name}";
    private static string EnvId(string serviceName, string key) => $"env:{serviceName}:{key}";
    private static string VolumeId(string name) => $"volume:{name}";
    private static string NetworkId(string name) => $"network:{name}";

    private static IEnumerable<string> CleanScalars(IEnumerable<YamlScalarNode> values) =>
        values.Select(value => value.Value?.Trim()).Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value!);
}
