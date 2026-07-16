using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using ComposeShip.Api.DTOs.Deployments;
using ComposeShip.Api.Exceptions;
using ComposeShip.Api.Services;

namespace ComposeShip.Api.Controllers;

[ApiController]
[Authorize]
public class DeploymentsController : ControllerBase
{
    private readonly DeploymentService _deploymentService;
    private readonly IAiDeploymentDiagnosisService _aiDiagnosisService;

    public DeploymentsController(
        DeploymentService deploymentService,
        IAiDeploymentDiagnosisService aiDiagnosisService)
    {
        _deploymentService = deploymentService;
        _aiDiagnosisService = aiDiagnosisService;
    }

    [HttpPost("api/services/{serviceId:guid}/deploy")]
    [EnableRateLimiting("Deploy")]
    public async Task<ActionResult<DeploymentResponse>> TriggerDeployment(Guid serviceId)
    {
        try
        {
            var userId = GetUserId();
            var deployment = await _deploymentService.TriggerDeploymentAsync(serviceId, userId);
            return AcceptedAtAction(nameof(GetDeployment), new { id = deployment.Id }, deployment);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
        catch (QuotaExceededException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (RuntimeModeUnavailableException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (PlatformCapacityException ex)
        {
            Response.Headers.RetryAfter = "60";
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
    }

    [HttpGet("api/services/{serviceId:guid}/deployments")]
    public async Task<ActionResult<List<DeploymentResponse>>> GetDeployments(Guid serviceId)
    {
        try
        {
            var userId = GetUserId();
            var deployments = await _deploymentService.GetDeploymentsAsync(serviceId, userId);
            return Ok(deployments);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
    }

    [HttpGet("api/deployments/{id:guid}")]
    public async Task<ActionResult<DeploymentResponse>> GetDeployment(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var deployment = await _deploymentService.GetDeploymentAsync(id, userId);
            return Ok(deployment);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Deployment not found." });
        }
    }

    [HttpGet("api/deployments/{id:guid}/logs")]
    public async Task<ActionResult<DeploymentLogsResponse>> GetDeploymentLogs(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var logs = await _deploymentService.GetDeploymentLogsAsync(id, userId);
            return Ok(logs);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Deployment not found." });
        }
    }

    [HttpGet("api/deployments/{id:guid}/diagnostic-snapshot")]
    public async Task<ActionResult<DeploymentDiagnosticSnapshotResponse>> GetDeploymentDiagnosticSnapshot(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var snapshot = await _deploymentService.GetDeploymentDiagnosticSnapshotAsync(id, userId);
            return Ok(snapshot);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Diagnostic snapshot not found." });
        }
    }

    [HttpGet("api/deployments/{id:guid}/ai-diagnosis")]
    public async Task<ActionResult<DeploymentAiDiagnosisResponse>> GetAiDiagnosis(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var diagnosis = await _aiDiagnosisService.GetDiagnosisAsync(id, userId);
            return Ok(diagnosis);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "AI diagnosis not found." });
        }
    }

    [HttpPost("api/deployments/{id:guid}/ai-diagnosis")]
    [EnableRateLimiting("AiDiagnosis")]
    public async Task<ActionResult<DeploymentAiDiagnosisResponse>> GenerateAiDiagnosis(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var diagnosis = await _aiDiagnosisService.GenerateDiagnosisAsync(id, userId);
            return Ok(diagnosis);
        }
        catch (KeyNotFoundException ex) when (ex.Message.Contains("snapshot", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { message = "Diagnostic snapshot not found for this deployment." });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Deployment not found." });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("configured", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(503, new { message = "AI diagnosis is not configured." });
        }
        catch (InvalidOperationException)
        {
            return StatusCode(502, new { message = "AI diagnosis could not be generated right now." });
        }
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException();
        return Guid.Parse(claim);
    }
}
