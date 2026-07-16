using System.ComponentModel.DataAnnotations;

namespace OneClickHost.Api.Models;

/// <summary>
/// Stores an invite-only admission token. The original code is deliberately
/// never persisted; only an HMAC derived from the server-side pepper is kept.
/// </summary>
public class Invite
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(64)]
    public string CodeHash { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RedeemedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Guid? RedeemedByUserId { get; set; }

    public User? RedeemedByUser { get; set; }
}
