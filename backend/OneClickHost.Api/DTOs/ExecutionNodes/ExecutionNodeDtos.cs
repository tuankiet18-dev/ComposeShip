using System.ComponentModel.DataAnnotations;
using OneClickHost.Api.DTOs.Projects;

namespace OneClickHost.Api.DTOs.ExecutionNodes;

public record RegisterExecutionNodeRequest(
    [Required, MaxLength(120)] string Name,
    [Required, MaxLength(500)] string PublicOrPrivateBaseUrl,
    [MaxLength(50)] string? Architecture,
    List<string>? Labels,
    int? MaxConcurrentBuilds,
    [Required, MaxLength(255)] string AgentToken,
    [Required, MaxLength(255)] string RegistrationToken
);

public record ExecutionNodeResponse(
    Guid Id,
    string Name,
    string PublicOrPrivateBaseUrl,
    string Architecture,
    List<string> Labels,
    string Status,
    int MaxConcurrentBuilds,
    int CurrentBuilds,
    DateTime? LastHeartbeatAt
);

public record HeartbeatExecutionNodeRequest(
    int CurrentBuilds,
    string? Status
);

public record LeaseRequest(
    int AvailableSlots,
    List<string>? Labels,
    int? CurrentBuilds,
    string? Status
);

public record LeaseResponse(
    bool HasWork,
    string? Kind,
    ComposeLeasePayload? Compose,
    ServiceLeasePayload? Service
);

public record ComposeLeasePayload(
    Guid DeploymentId,
    Guid ProjectId,
    string ProjectName,
    string RepoUrl,
    string Branch,
    string? Subfolder,
    string? ComposeFile,
    string ComposeProjectName,
    List<ComposeRouteResponse> Routes,
    List<ComposeEnvVarResponse> EnvironmentVariables,
    string? PostStartCommands
);

public record ServiceLeasePayload(
    Guid DeploymentId,
    Guid ServiceId,
    Guid ProjectId,
    string ProjectName,
    string ServiceName,
    string ServiceType,
    string? RepoUrl,
    string Branch,
    string? Subfolder,
    string? NetworkAliases,
    Dictionary<string, string> EnvironmentVariables,
    int Version
);

public record DeploymentEventRequest(
    [Required, MaxLength(30)] string Kind,
    [Required, MaxLength(30)] string Status,
    string? BuildLogs,
    string? ErrorMessage,
    [MaxLength(50)] string? FailureCategory,
    List<string>? PublicUrls,
    string? ImageTag,
    string? ContainerId
);

public record UpsertRouteTargetRequest(
    Guid ProjectId,
    Guid? ProjectDeploymentId,
    Guid? ServiceId,
    [Required, MaxLength(255)] string Host,
    [Required, MaxLength(1000)] string TargetUrl,
    [MaxLength(30)] string? Status
);
