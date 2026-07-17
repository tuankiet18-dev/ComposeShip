using System.ComponentModel.DataAnnotations;
using ComposeShip.Api.DTOs.Projects;

namespace ComposeShip.Api.DTOs.ExecutionNodes;

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
    ServiceLeasePayload? Service,
    StopLeasePayload? Stop,
    DeleteLeasePayload? Delete
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

// Cleanup is leased to the node that owns the running Compose stack. The node
// can stop containers locally, but it cannot mutate control-plane state directly.
public record StopLeasePayload(
    Guid ProjectId,
    string ProjectName,
    string ComposeProjectName
);

public record CompleteStopRequest(
    Guid ProjectId,
    string? ErrorMessage
);

// Delete is distinct from stop: it removes the stack's project-scoped named
// volumes after the execution node has removed its local Docker resources.
public record DeleteLeasePayload(
    Guid ProjectId,
    string ProjectName,
    string ComposeProjectName,
    bool RemoveVolumes
);

public record CompleteDeleteRequest(
    Guid ProjectId,
    string? ErrorMessage
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

public record CleanupInventoryResponse(
    List<Guid> ActiveDeploymentIds,
    List<Guid> ActiveServiceIds,
    List<string> ActiveComposeProjectNames,
    List<string> ActiveImageTags
);
