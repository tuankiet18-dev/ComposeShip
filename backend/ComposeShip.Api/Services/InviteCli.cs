namespace ComposeShip.Api.Services;

public static class InviteCli
{
    public static bool IsCommand(string[] args) => args.Length >= 2 && args[0] == "--invite";

    public static async Task RunAsync(string[] args, InviteService invites)
    {
        switch (args[1])
        {
            case "create":
            {
                var lifetime = TimeSpan.FromHours(ReadPositiveInt(args, "--expires-hours", 168));
                var invite = await invites.CreateAsync(lifetime, ReadOption(args, "--note"));
                Console.WriteLine($"Invite ID: {invite.Id}");
                Console.WriteLine($"Invite code (shown once): {invite.Code}");
                Console.WriteLine($"Expires (UTC): {invite.ExpiresAt:O}");
                return;
            }
            case "list":
                foreach (var invite in await invites.ListAsync())
                    Console.WriteLine($"{invite.Id}\t{State(invite)}\t{invite.ExpiresAt:O}\t{invite.Note ?? ""}");
                return;
            case "revoke" when args.Length == 3 && Guid.TryParse(args[2], out var inviteId):
                await invites.RevokeAsync(inviteId);
                Console.WriteLine("Invite revoked.");
                return;
            default:
                throw new ArgumentException("Usage: --invite create [--expires-hours 168] [--note text] | --invite list | --invite revoke <invite-id>");
        }
    }

    private static string State(InviteSummary invite) => invite.RevokedAt is not null ? "revoked" : invite.RedeemedAt is not null ? "redeemed" : invite.ExpiresAt <= DateTime.UtcNow ? "expired" : "active";

    private static string? ReadOption(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    private static int ReadPositiveInt(string[] args, string name, int defaultValue) =>
        int.TryParse(ReadOption(args, name), out var value) && value > 0 ? value : defaultValue;
}
