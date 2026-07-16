using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;

namespace OneClickHost.Api.Services;

/// <summary>
/// Host-only recovery actions. This deliberately has no HTTP controller: the
/// invite-only MVP keeps operational authority on the control-plane shell.
/// </summary>
public sealed class AdminRecoveryService
{
    private readonly AppDbContext _db;
    private readonly ProjectEventService _events;

    public AdminRecoveryService(AppDbContext db, ProjectEventService events)
    {
        _db = db;
        _events = events;
    }

    public async Task SetAccountDisabledAsync(Guid userId, bool disabled)
    {
        var user = await _db.Users.FindAsync(userId) ?? throw new KeyNotFoundException("Account not found.");
        user.IsDisabled = disabled;
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task DrainNodeAsync(Guid nodeId, bool drain)
    {
        var node = await _db.ExecutionNodes.FindAsync(nodeId) ?? throw new KeyNotFoundException("Execution node not found.");
        node.Status = drain ? "draining" : "active";
        node.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task RetryProjectCleanupAsync(Guid projectId)
    {
        var project = await _db.Projects.FindAsync(projectId) ?? throw new KeyNotFoundException("Project not found.");
        if (project.Status is not ("cleanup_failed" or "deleting_failed"))
            throw new InvalidOperationException("Only cleanup_failed or deleting_failed projects can be retried.");

        project.Status = "deleting";
        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _events.AddAsync(project.Id, "cleanup.retry_requested", "warning", "An administrator requested cleanup retry.");
    }
}
