using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class ExecutionNode
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string PublicOrPrivateBaseUrl { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Architecture { get; set; } = "unknown";

    public string? LabelsJson { get; set; }

    [MaxLength(30)]
    public string Status { get; set; } = "active";

    public int MaxConcurrentBuilds { get; set; } = 1;
    public int CurrentBuilds { get; set; }

    public DateTime? LastHeartbeatAt { get; set; }

    [Required, MaxLength(255)]
    public string AgentTokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<RouteTarget> RouteTargets { get; set; } = new List<RouteTarget>();
    public ICollection<Deployment> Deployments { get; set; } = new List<Deployment>();
    public ICollection<ProjectDeployment> ProjectDeployments { get; set; } = new List<ProjectDeployment>();
    public ICollection<ProjectEvent> Events { get; set; } = new List<ProjectEvent>();
}
