using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Projects;
using OneClickHost.Api.Models;

namespace OneClickHost.Api.Services;

public class ProjectEventService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;

    public ProjectEventService(AppDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(
        Guid projectId,
        string type,
        string severity,
        string message,
        Guid? deploymentId = null,
        Guid? executionNodeId = null,
        Guid? routeTargetId = null,
        Dictionary<string, string>? metadata = null)
    {
        _db.ProjectEvents.Add(new ProjectEvent
        {
            ProjectId = projectId,
            DeploymentId = deploymentId,
            ExecutionNodeId = executionNodeId,
            RouteTargetId = routeTargetId,
            Type = type,
            Severity = severity,
            Message = message,
            MetadataJson = metadata is null || metadata.Count == 0 ? null : JsonSerializer.Serialize(metadata, JsonOptions),
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
    }

    public async Task<List<ProjectEventResponse>> GetProjectEventsAsync(Guid projectId, Guid userId)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId);
        if (!projectExists)
            throw new KeyNotFoundException("Project not found.");

        var events = await _db.ProjectEvents
            .Where(ev => ev.ProjectId == projectId)
            .Include(ev => ev.ExecutionNode)
            .OrderByDescending(ev => ev.CreatedAt)
            .Take(100)
            .ToListAsync();

        return events.Select(ToResponse).ToList();
    }

    public static ProjectEventResponse ToResponse(ProjectEvent ev) => new(
        ev.Id,
        ev.ProjectId,
        ev.DeploymentId,
        ev.ExecutionNodeId,
        ev.ExecutionNode?.Name,
        ev.RouteTargetId,
        ev.Type,
        ev.Severity,
        ev.Message,
        ReadMetadata(ev.MetadataJson),
        ev.CreatedAt
    );

    private static Dictionary<string, string> ReadMetadata(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<Dictionary<string, string>>(json, JsonOptions) ?? [];
}
