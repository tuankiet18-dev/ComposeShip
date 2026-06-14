using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active | queued | deploying | live | unhealthy | stopping | stopped | failed | deleting

    [MaxLength(20)]
    public string DeploymentMode { get; set; } = "services"; // services | compose

    [MaxLength(500)]
    public string? RepoUrl { get; set; }

    [MaxLength(100)]
    public string Branch { get; set; } = "main";

    [MaxLength(255)]
    public string? Subfolder { get; set; }

    [MaxLength(255)]
    public string? ComposeFile { get; set; }

    [MaxLength(120)]
    public string? ComposeProjectName { get; set; }

    public string? ComposeRoutesJson { get; set; }

    public string? ComposeEnvJson { get; set; }

    public string? ComposePostStartCommands { get; set; }

    public bool ComposeDeleteVolumesOnDelete { get; set; }

    public string? ComposeLiveUrlsJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User User { get; set; } = null!;
    public ICollection<Service> Services { get; set; } = new List<Service>();
    public ICollection<ProjectDeployment> ProjectDeployments { get; set; } = new List<ProjectDeployment>();
    public ICollection<RouteTarget> RouteTargets { get; set; } = new List<RouteTarget>();
    public ICollection<ProjectEvent> Events { get; set; } = new List<ProjectEvent>();
}
