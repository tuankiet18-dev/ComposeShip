using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.Exceptions;
using OneClickHost.Api.Models;

namespace OneClickHost.Api.Services;

public sealed class InviteService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;

    public InviteService(AppDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    public bool Required => _configuration.GetValue("Invites:Required", true);

    public async Task<CreatedInvite> CreateAsync(TimeSpan lifetime, string? note)
    {
        if (lifetime <= TimeSpan.Zero || lifetime > TimeSpan.FromDays(90))
            throw new ArgumentOutOfRangeException(nameof(lifetime), "Invite lifetime must be between 1 second and 90 days.");

        var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(20));
        var invite = new Invite
        {
            CodeHash = HashCode(code),
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            ExpiresAt = DateTime.UtcNow.Add(lifetime)
        };
        _db.Invites.Add(invite);
        await _db.SaveChangesAsync();
        return new CreatedInvite(invite.Id, code, invite.ExpiresAt, invite.Note);
    }

    public async Task<IReadOnlyList<InviteSummary>> ListAsync() => await _db.Invites.AsNoTracking()
        .OrderByDescending(i => i.CreatedAt)
        .Select(i => new InviteSummary(i.Id, i.Note, i.CreatedAt, i.ExpiresAt, i.RedeemedAt, i.RevokedAt, i.RedeemedByUserId))
        .ToListAsync();

    public async Task RevokeAsync(Guid inviteId)
    {
        var invite = await _db.Invites.FindAsync(inviteId)
            ?? throw new KeyNotFoundException("Invite not found.");
        if (invite.RedeemedAt is not null)
            throw new InvalidOperationException("A redeemed invite cannot be revoked.");

        invite.RevokedAt ??= DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task ConsumeAsync(string? code, User user)
    {
        if (!Required)
            return;

        if (string.IsNullOrWhiteSpace(code))
            throw new InviteRejectedException("Registration could not be completed.");

        var hash = HashCode(code.Trim());
        var now = DateTime.UtcNow;
        var invite = await _db.Invites.SingleOrDefaultAsync(i => i.CodeHash == hash);
        if (invite is null || invite.RedeemedAt is not null || invite.RevokedAt is not null || invite.ExpiresAt <= now)
            throw new InviteRejectedException("Registration could not be completed.");

        invite.RedeemedAt = now;
        invite.RedeemedByUserId = user.Id;
    }

    private string HashCode(string code)
    {
        var pepper = _configuration["Invites:CodePepper"];
        if (string.IsNullOrWhiteSpace(pepper))
            throw new InvalidOperationException("Invites:CodePepper must be configured.");

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(pepper));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(code)));
    }
}

public sealed record CreatedInvite(Guid Id, string Code, DateTime ExpiresAt, string? Note);
public sealed record InviteSummary(Guid Id, string? Note, DateTime CreatedAt, DateTime ExpiresAt, DateTime? RedeemedAt, DateTime? RevokedAt, Guid? RedeemedByUserId);
