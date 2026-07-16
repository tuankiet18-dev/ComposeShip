namespace OneClickHost.Api.Services;

public static class AdminRecoveryCli
{
    public static bool IsCommand(string[] args) => args.Length >= 3 && args[0] == "--admin";

    public static async Task RunAsync(string[] args, AdminRecoveryService recovery)
    {
        if (!Guid.TryParse(args[2], out var id))
            throw new ArgumentException("Expected a GUID resource id.");

        switch (args[1])
        {
            case "disable-account": await recovery.SetAccountDisabledAsync(id, true); break;
            case "enable-account": await recovery.SetAccountDisabledAsync(id, false); break;
            case "drain-node": await recovery.DrainNodeAsync(id, true); break;
            case "activate-node": await recovery.DrainNodeAsync(id, false); break;
            case "retry-cleanup": await recovery.RetryProjectCleanupAsync(id); break;
            default: throw new ArgumentException("Usage: --admin disable-account|enable-account|drain-node|activate-node|retry-cleanup <guid>");
        }
        Console.WriteLine("Administrative recovery action completed.");
    }
}
