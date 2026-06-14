using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class RouteTarget
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProjectId { get; set; }
    public Guid? ProjectDeploymentId { get; set; }
    public Guid? ServiceId { get; set; }
    public Guid ExecutionNodeId { get; set; }

    [Required, MaxLength(255)]
    public string Host { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string TargetUrl { get; set; } = string.Empty;

    [MaxLength(30)]
    public string Status { get; set; } = "active";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Project Project { get; set; } = null!;
    public ProjectDeployment? ProjectDeployment { get; set; }
    public Service? Service { get; set; }
    public ExecutionNode ExecutionNode { get; set; } = null!;
    public ICollection<ProjectEvent> Events { get; set; } = new List<ProjectEvent>();
}
