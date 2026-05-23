using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class DeploymentAiDiagnosis
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DeploymentId { get; set; }

    public string DiagnosisJson { get; set; } = "{}";

    [MaxLength(100)]
    public string ModelName { get; set; } = "";

    [MaxLength(50)]
    public string PromptVersion { get; set; } = "";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Deployment Deployment { get; set; } = null!;
}
