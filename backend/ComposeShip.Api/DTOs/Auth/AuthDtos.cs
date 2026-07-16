using System.ComponentModel.DataAnnotations;

namespace ComposeShip.Api.DTOs.Auth;

public record RegisterRequest(
    [Required, EmailAddress] string Email,
    [Required, MinLength(8)]
    [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$", ErrorMessage = "Password must contain at least one uppercase letter, one lowercase letter, and one number.")]
    string Password,
    [Required, MaxLength(100)] string FullName,
    [Required, MinLength(20), MaxLength(200)] string InviteCode,
    bool AcceptedPilotTerms
);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password
);

public record AuthResponse(
    Guid Id,
    string Email,
    string FullName,
    string Token
);

public record UserProfileResponse(
    Guid Id,
    string Email,
    string FullName,
    DateTime CreatedAt
);
