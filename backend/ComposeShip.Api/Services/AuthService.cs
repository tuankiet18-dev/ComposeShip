using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ComposeShip.Api.Data;
using ComposeShip.Api.DTOs.Auth;
using ComposeShip.Api.Exceptions;
using ComposeShip.Api.Models;

namespace ComposeShip.Api.Services;

public class AuthService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly InviteService _invites;

    public AuthService(AppDbContext db, IConfiguration config, InviteService invites)
    {
        _db = db;
        _config = config;
        _invites = invites;
    }

    public async Task RegisterAsync(RegisterRequest request)
    {
        await using var transaction = await BeginRegistrationTransactionAsync();
        if (!request.AcceptedPilotTerms)
            throw new InvalidOperationException("Registration could not be completed.");

        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            throw new InvalidOperationException("Registration failed. Email might be invalid or already registered.");

        var accountCap = Math.Max(1, _config.GetValue("Invites:MaxAccounts", 10));
        if (await _db.Users.CountAsync() >= accountCap)
            throw new InviteRejectedException("Registration could not be completed.");

        var user = new User
        {
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName,
            PilotTermsAcceptedAt = DateTime.UtcNow
        };

        await _invites.ConsumeAsync(request.InviteCode, user);
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        if (transaction is not null)
            await transaction.CommitAsync();
    }

    private async Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction?> BeginRegistrationTransactionAsync()
    {
        if (_db.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) != true)
            return null;

        var transaction = await _db.Database.BeginTransactionAsync();
        // Serialize the check-plus-redeem path so neither a one-use invite nor
        // the global pilot account cap can be bypassed by concurrent requests.
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(4, 1)");
        return transaction;
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email)
            ?? throw new UnauthorizedAccessException("Invalid credentials.");

        if (user.IsDisabled || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials.");

        var token = GenerateJwtToken(user);
        return new AuthResponse(user.Id, user.Email, user.FullName, token);
    }

    public async Task<UserProfileResponse> GetProfileAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new KeyNotFoundException("User not found.");

        return new UserProfileResponse(user.Id, user.Email, user.FullName, user.CreatedAt);
    }

    private string GenerateJwtToken(User user)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.FullName)
        };

        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiryHours = int.Parse(_config["Jwt:ExpiryHours"] ?? "24");

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(expiryHours),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
