using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.DTOs.Services;

public record CreateServiceRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(500)] string? RepoUrl,
    [MaxLength(100)] string? Branch,
    [MaxLength(255)] string? Subfolder,
    [MaxLength(20)] string? ServiceType,   // frontend | backend | database | redis
    /// <summary>Comma-separated Docker network aliases, e.g. "smartinvoice-backend,backend"</summary>
    [MaxLength(500)] string? NetworkAliases
);

public record UpdateServiceRequest(
    [MaxLength(100)] string? Name,
    [MaxLength(500)] string? RepoUrl,
    [MaxLength(100)] string? Branch,
    [MaxLength(255)] string? Subfolder,
    [MaxLength(20)] string? ServiceType,
    [MaxLength(500)] string? NetworkAliases
);

public record ServiceResponse(
    Guid Id,
    Guid ProjectId,
    string Name,
    string RepoUrl,
    string Branch,
    string? Subfolder,
    string ServiceType,
    string? DetectedStack,
    string? NetworkAliases,
    string Status,
    string? LiveUrl,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record ServiceDetailResponse(
    Guid Id,
    Guid ProjectId,
    string Name,
    string RepoUrl,
    string Branch,
    string? Subfolder,
    string ServiceType,
    string? DetectedStack,
    string? NetworkAliases,
    string? ContainerId,
    string Status,
    string? LiveUrl,
    List<EnvVarResponse> EnvironmentVariables,
    List<DeploymentSummary> RecentDeployments,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record EnvVarResponse(
    Guid Id,
    string Key,
    string Value,
    bool IsSecret
);

public record EnvVarUpdateRequest(
    Guid? Id,
    [Required, MaxLength(255)] string Key,
    [Required, MaxLength(2000)] string Value,
    bool IsSecret
);

public record DeploymentSummary(
    Guid Id,
    string Status,
    int Version,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    DateTime CreatedAt
);
