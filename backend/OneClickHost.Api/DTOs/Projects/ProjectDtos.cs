using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.DTOs.Projects;

public record CreateProjectRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(500)] string? Description
);

public record ProjectResponse(
    Guid Id,
    string Name,
    string? Description,
    string Status,
    string DeploymentMode,
    int ServiceCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record ProjectDetailResponse(
    Guid Id,
    string Name,
    string? Description,
    string Status,
    string DeploymentMode,
    ComposeConfigResponse? ComposeConfig,
    List<ProjectDeploymentResponse> RecentProjectDeployments,
    List<ProjectServiceSummary> Services,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record ProjectServiceSummary(
    Guid Id,
    string Name,
    string ServiceType,
    string ExposureProvider,
    string? DetectedStack,
    string Status,
    string? LiveUrl
);

public record ComposeConfigRequest(
    [Required, MaxLength(500)] string RepoUrl,
    [MaxLength(100)] string? Branch,
    [MaxLength(255)] string? Subfolder,
    [MaxLength(255)] string? ComposeFile,
    List<ComposeRouteRequest> Routes,
    List<ComposeEnvVarRequest>? EnvironmentVariables,
    string? PostStartCommands
);

public record ComposeInspectRequest(
    [Required, MaxLength(500)] string RepoUrl,
    [MaxLength(100)] string? Branch,
    [MaxLength(255)] string? Subfolder,
    [MaxLength(255)] string? ComposeFile
);

public record ComposeInspectResponse(
    string ComposeFile,
    List<ComposeServiceSuggestion> Services,
    List<ComposeRouteResponse> SuggestedRoutes,
    List<ComposeEnvVarResponse> SuggestedEnvironmentVariables,
    StatefulMetadataResponse Stateful
);

public record ComposeServiceSuggestion(
    string Name,
    string? Image,
    string? BuildContext,
    List<int> Ports,
    List<string> EnvironmentKeys,
    bool LooksPublic
);

public record ComposeServiceResponse(
    string Name,
    string Type,
    string? Image,
    string? BuildContext,
    string? Command,
    List<int> Ports,
    List<string> EnvironmentKeys,
    List<string> Dependencies,
    List<string> Volumes,
    List<string> Networks,
    List<ComposeRouteResponse> Routes,
    bool IsPublic,
    string Status
);

public record ComposeRouteRequest(
    [Required, MaxLength(100)] string ServiceName,
    [Required, MaxLength(100)] string RouteSlug,
    int InternalPort,
    [MaxLength(40)] string? ExposureProvider,
    [MaxLength(255)] string? HealthPath
);

public record ComposeEnvVarRequest(
    [MaxLength(100)] string? ServiceName,
    [Required, MaxLength(255)] string Key,
    [Required, MaxLength(2000)] string Value,
    bool IsSecret
);

public record ComposeConfigResponse(
    string? RepoUrl,
    string Branch,
    string? Subfolder,
    string? ComposeFile,
    string? ComposeProjectName,
    List<ComposeRouteResponse> Routes,
    List<ComposeEnvVarResponse> EnvironmentVariables,
    string? PostStartCommands,
    List<string> LiveUrls,
    StatefulMetadataResponse Stateful
);

public record ComposeRouteResponse(
    string ServiceName,
    string RouteSlug,
    int InternalPort,
    string ExposureProvider,
    string? HealthPath,
    string? LiveUrl
);

public record ComposeEnvVarResponse(
    string ServiceName,
    string Key,
    string Value,
    bool IsSecret
);

public record ProjectDeploymentResponse(
    Guid Id,
    Guid ProjectId,
    string Status,
    string? ComposeProjectName,
    List<string> PublicUrls,
    string? ErrorMessage,
    int Version,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    DateTime CreatedAt,
    string? ExecutionNodeName,
    string? FailureCategory,
    List<RouteTargetResponse> RouteTargets
);

public record ProjectDeploymentLogsResponse(
    Guid DeploymentId,
    string Status,
    string? BuildLogs
);

public record RouteTargetResponse(
    Guid Id,
    string Host,
    string TargetUrl,
    string Status,
    string? ExecutionNodeName,
    DateTime UpdatedAt
);

public record StatefulMetadataResponse(
    string Risk,
    List<string> Warnings
);

public record ProjectEventResponse(
    Guid Id,
    Guid ProjectId,
    Guid? DeploymentId,
    Guid? ExecutionNodeId,
    string? ExecutionNodeName,
    Guid? RouteTargetId,
    string Type,
    string Severity,
    string Message,
    Dictionary<string, string> Metadata,
    DateTime CreatedAt
);

public record DeploymentGraphResponse(
    List<DeploymentGraphNodeResponse> Nodes,
    List<DeploymentGraphEdgeResponse> Edges
);

public record DeploymentGraphNodeResponse(
    string Id,
    string Type,
    string Label,
    Dictionary<string, string> Metadata
);

public record DeploymentGraphEdgeResponse(
    string Id,
    string Type,
    string Source,
    string Target,
    string Label,
    Dictionary<string, string> Metadata
);
