using System.ComponentModel.DataAnnotations;

namespace ComposeShip.Api.Models;

public class Deployment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ServiceId { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "queued"; // queued | cloning | building | deploying | live | failed

    [MaxLength(200)]
    public string? ImageTag { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// Build logs stored as a single text blob for MVP.
    /// Can be migrated to a separate table later for search/streaming.
    /// </summary>
    public string? BuildLogs { get; set; }

    public int Version { get; set; } = 1;

    public Guid? LockedByNodeId { get; set; }
    public DateTime? LockedAt { get; set; }
    public DateTime? HeartbeatAt { get; set; }
    public int RetryCount { get; set; }
    public DateTime? NextRunAt { get; set; }

    [MaxLength(50)]
    public string? FailureCategory { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Service Service { get; set; } = null!;
    public ExecutionNode? LockedByNode { get; set; }
    public DeploymentDiagnosticSnapshot? DiagnosticSnapshot { get; set; }
    public DeploymentAiDiagnosis? AiDiagnosis { get; set; }
}
