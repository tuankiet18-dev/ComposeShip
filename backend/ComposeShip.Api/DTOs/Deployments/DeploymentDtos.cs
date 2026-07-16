namespace ComposeShip.Api.DTOs.Deployments;

public record DeploymentResponse(
    Guid Id,
    Guid ServiceId,
    string Status,
    string? ImageTag,
    string? ErrorMessage,
    int Version,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    DateTime CreatedAt,
    string? ExecutionNodeName,
    string? FailureCategory
);

public record DeploymentLogsResponse(
    Guid DeploymentId,
    string Status,
    string? BuildLogs
);

public record RepositoryTreeEntryResponse(
    string Path,
    string Type
);

public record DeploymentDiagnosticSnapshotResponse(
    Guid DeploymentId,
    string FailureStep,
    string? DetectedStack,
    string? ErrorSummary,
    string? RelevantLogExcerpt,
    IReadOnlyList<RepositoryTreeEntryResponse> RepositoryTree,
    IReadOnlyDictionary<string, string> SelectedFiles,
    DateTime CreatedAt
);

public record FileInspectionSuggestionResponse(
    string Path,
    string Reason
);

public record AiDiagnosisContentResponse(
    string Diagnosis,
    string RootCauseCategory,
    string Confidence,
    IReadOnlyList<string> Evidence,
    IReadOnlyList<FileInspectionSuggestionResponse> FilesToInspect,
    IReadOnlyList<string> SuggestedFixes,
    bool IsLikelyPlatformIssue,
    string? PlatformIssueReason,
    IReadOnlyList<string> MissingInformation
);

public record DeploymentAiDiagnosisResponse(
    Guid Id,
    Guid DeploymentId,
    AiDiagnosisContentResponse Diagnosis,
    string ModelName,
    string PromptVersion,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
