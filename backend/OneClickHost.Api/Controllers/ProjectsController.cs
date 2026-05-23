using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneClickHost.Api.DTOs.Projects;
using OneClickHost.Api.Services;

namespace OneClickHost.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly ProjectService _projectService;

    public ProjectsController(ProjectService projectService)
    {
        _projectService = projectService;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectResponse>>> GetProjects()
    {
        var userId = GetUserId();
        var projects = await _projectService.GetUserProjectsAsync(userId);
        return Ok(projects);
    }

    [HttpPost]
    public async Task<ActionResult<ProjectResponse>> CreateProject([FromBody] CreateProjectRequest request)
    {
        var userId = GetUserId();
        var project = await _projectService.CreateProjectAsync(userId, request);
        return CreatedAtAction(nameof(GetProject), new { id = project.Id }, project);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectDetailResponse>> GetProject(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var project = await _projectService.GetProjectAsync(id, userId);
            return Ok(project);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteProject(Guid id)
    {
        try
        {
            var userId = GetUserId();
            await _projectService.DeleteProjectAsync(id, userId);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
    }

    [HttpPut("{id:guid}/compose-config")]
    public async Task<ActionResult<ComposeConfigResponse>> UpdateComposeConfig(Guid id, [FromBody] ComposeConfigRequest request)
    {
        try
        {
            var userId = GetUserId();
            var config = await _projectService.UpdateComposeConfigAsync(id, userId, request);
            return Ok(config);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/compose-inspect")]
    public async Task<ActionResult<ComposeInspectResponse>> InspectCompose(Guid id, [FromBody] ComposeInspectRequest request)
    {
        try
        {
            var userId = GetUserId();
            var result = await _projectService.InspectComposeAsync(id, userId, request);
            return Ok(result);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/deploy")]
    public async Task<ActionResult<ProjectDeploymentResponse>> DeployProject(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var deployment = await _projectService.TriggerProjectDeploymentAsync(id, userId);
            return Accepted(deployment);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{id:guid}/deployments")]
    public async Task<ActionResult<List<ProjectDeploymentResponse>>> GetProjectDeployments(Guid id)
    {
        try
        {
            var userId = GetUserId();
            return Ok(await _projectService.GetProjectDeploymentsAsync(id, userId));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
    }

    [HttpPost("{id:guid}/stop")]
    public async Task<IActionResult> StopProject(Guid id)
    {
        try
        {
            var userId = GetUserId();
            await _projectService.StopProjectAsync(id, userId);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("/api/project-deployments/{id:guid}/logs")]
    public async Task<ActionResult<ProjectDeploymentLogsResponse>> GetProjectDeploymentLogs(Guid id)
    {
        try
        {
            var userId = GetUserId();
            return Ok(await _projectService.GetProjectDeploymentLogsAsync(id, userId));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project deployment not found." });
        }
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException();
        return Guid.Parse(claim);
    }
}
