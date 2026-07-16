using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string FullName { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDisabled { get; set; }
    public DateTime? PilotTermsAcceptedAt { get; set; }

    public ICollection<Invite> RedeemedInvites { get; set; } = new List<Invite>();

    // Navigation
    public ICollection<Project> Projects { get; set; } = new List<Project>();
}
