using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class ProjectDeployment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProjectId { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "queued";

    [MaxLength(120)]
    public string? ComposeProjectName { get; set; }

    public string? PublicUrlsJson { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public string? BuildLogs { get; set; }

    public int Version { get; set; } = 1;

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Project Project { get; set; } = null!;
}
