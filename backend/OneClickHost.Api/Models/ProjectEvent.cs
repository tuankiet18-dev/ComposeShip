using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class ProjectEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProjectId { get; set; }
    public Guid? DeploymentId { get; set; }
    public Guid? ExecutionNodeId { get; set; }
    public Guid? RouteTargetId { get; set; }

    [Required, MaxLength(80)]
    public string Type { get; set; } = string.Empty;

    [Required, MaxLength(20)]
    public string Severity { get; set; } = "info";

    [Required, MaxLength(1000)]
    public string Message { get; set; } = string.Empty;

    public string? MetadataJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Project Project { get; set; } = null!;
    public ProjectDeployment? Deployment { get; set; }
    public ExecutionNode? ExecutionNode { get; set; }
    public RouteTarget? RouteTarget { get; set; }
}
