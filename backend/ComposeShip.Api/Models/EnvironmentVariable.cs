using System.ComponentModel.DataAnnotations;

namespace ComposeShip.Api.Models;

public class EnvironmentVariable
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ServiceId { get; set; }

    [Required, MaxLength(255)]
    public string Key { get; set; } = string.Empty;

    [Required, MaxLength(2000)]
    public string Value { get; set; } = string.Empty;

    public bool IsSecret { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Service Service { get; set; } = null!;
}
