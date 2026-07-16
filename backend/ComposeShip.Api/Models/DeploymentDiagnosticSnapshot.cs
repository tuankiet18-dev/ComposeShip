using System.ComponentModel.DataAnnotations;

namespace ComposeShip.Api.Models;

public class DeploymentDiagnosticSnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DeploymentId { get; set; }

    [MaxLength(50)]
    public string FailureStep { get; set; } = "unknown";

    [MaxLength(50)]
    public string? DetectedStack { get; set; }

    [MaxLength(500)]
    public string? ErrorSummary { get; set; }

    public string? RelevantLogExcerpt { get; set; }

    public string? RepositoryTree { get; set; }

    public string? SelectedFiles { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Deployment Deployment { get; set; } = null!;
}
