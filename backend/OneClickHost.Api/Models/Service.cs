using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class Service
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProjectId { get; set; }

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string RepoUrl { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Branch { get; set; } = "main";

    [MaxLength(255)]
    public string? Subfolder { get; set; }

    [MaxLength(20)]
    public string ServiceType { get; set; } = "frontend"; // frontend | backend

    /// <summary>
    /// Comma-separated Docker network aliases for this container.
    /// Allows other containers to reach this service by custom hostnames.
    /// Example: "smartinvoice-backend,backend" — FE nginx.conf can use "smartinvoice-backend" as upstream.
    /// </summary>
    [MaxLength(500)]
    public string? NetworkAliases { get; set; }

    [MaxLength(30)]
    public string? DetectedStack { get; set; } // react | nextjs | aspnet | springboot

    [MaxLength(100)]
    public string? ContainerId { get; set; }

    [MaxLength(500)]
    public string? LiveUrl { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "created"; // created | deploying | live | stopped | failed

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Project Project { get; set; } = null!;
    public ICollection<Deployment> Deployments { get; set; } = new List<Deployment>();
    public ICollection<EnvironmentVariable> EnvironmentVariables { get; set; } = new List<EnvironmentVariable>();
}
