using Microsoft.EntityFrameworkCore;
using OneClickHost.Api.Data;
using OneClickHost.Api.DTOs.Projects;
using OneClickHost.Api.Models;

namespace OneClickHost.Api.Services;

public class ProjectService
{
    private readonly AppDbContext _db;

    public ProjectService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<ProjectResponse>> GetUserProjectsAsync(Guid userId)
    {
        return await _db.Projects
            .Where(p => p.UserId == userId && p.Status != "deleting")
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new ProjectResponse(
                p.Id, p.Name, p.Description,
                p.Status,
                p.Services.Count,
                p.CreatedAt, p.UpdatedAt))
            .ToListAsync();
    }

    public async Task<ProjectDetailResponse> GetProjectAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .Include(p => p.Services)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        return new ProjectDetailResponse(
            project.Id, project.Name, project.Description, project.Status,
            project.Services.Where(s => s.Status != "deleting").Select(s => new ProjectServiceSummary(
                s.Id, s.Name, s.ServiceType, s.DetectedStack, s.Status, s.LiveUrl
            )).ToList(),
            project.CreatedAt, project.UpdatedAt
        );
    }

    public async Task<ProjectResponse> CreateProjectAsync(Guid userId, CreateProjectRequest request)
    {
        var project = new Project
        {
            UserId = userId,
            Name = request.Name,
            Description = request.Description
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return new ProjectResponse(
            project.Id, project.Name, project.Description, project.Status,
            0, project.CreatedAt, project.UpdatedAt);
    }

    public async Task DeleteProjectAsync(Guid projectId, Guid userId)
    {
        var project = await _db.Projects
            .Include(p => p.Services)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new KeyNotFoundException("Project not found.");

        // Deletion is asynchronous. The Worker must stop containers and remove
        // Traefik route files before the project row can be safely removed.
        project.Status = "deleting";
        project.UpdatedAt = DateTime.UtcNow;
        foreach (var service in project.Services)
        {
            service.Status = "deleting";
            service.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
    }
}
