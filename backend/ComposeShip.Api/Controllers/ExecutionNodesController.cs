using Microsoft.AspNetCore.Mvc;
using ComposeShip.Api.DTOs.ExecutionNodes;
using ComposeShip.Api.DTOs.Projects;
using ComposeShip.Api.Services;

namespace ComposeShip.Api.Controllers;

[ApiController]
[Route("api/execution-nodes")]
public class ExecutionNodesController : ControllerBase
{
    private const string NodeTokenHeader = "X-ComposeShip-Node-Token";
    private readonly ExecutionNodeService _executionNodeService;

    public ExecutionNodesController(ExecutionNodeService executionNodeService)
    {
        _executionNodeService = executionNodeService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<ExecutionNodeResponse>> Register([FromBody] RegisterExecutionNodeRequest request)
    {
        try
        {
            return Ok(await _executionNodeService.RegisterAsync(request));
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node registration token." });
        }
    }

    [HttpPost("{id:guid}/heartbeat")]
    public async Task<ActionResult<ExecutionNodeResponse>> Heartbeat(Guid id, [FromBody] HeartbeatExecutionNodeRequest request)
    {
        try
        {
            var node = await _executionNodeService.AuthenticateAsync(id, Request.Headers[NodeTokenHeader].FirstOrDefault());
            return Ok(await _executionNodeService.HeartbeatAsync(node, request));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Execution node not found." });
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node token." });
        }
    }

    [HttpPost("{id:guid}/lease")]
    public async Task<ActionResult<LeaseResponse>> Lease(Guid id, [FromBody] LeaseRequest request)
    {
        try
        {
            var node = await _executionNodeService.AuthenticateAsync(id, Request.Headers[NodeTokenHeader].FirstOrDefault());
            return Ok(await _executionNodeService.LeaseAsync(node, request));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Execution node not found." });
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node token." });
        }
    }

    [HttpPost("{id:guid}/deployments/{deploymentId:guid}/events")]
    public async Task<IActionResult> RecordEvent(Guid id, Guid deploymentId, [FromBody] DeploymentEventRequest request)
    {
        try
        {
            var node = await _executionNodeService.AuthenticateAsync(id, Request.Headers[NodeTokenHeader].FirstOrDefault());
            await _executionNodeService.RecordEventAsync(node, deploymentId, request);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Deployment not found for this execution node." });
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node token." });
        }
    }

    [HttpPost("{id:guid}/route-targets")]
    public async Task<ActionResult<RouteTargetResponse>> UpsertRouteTarget(Guid id, [FromBody] UpsertRouteTargetRequest request)
    {
        try
        {
            var node = await _executionNodeService.AuthenticateAsync(id, Request.Headers[NodeTokenHeader].FirstOrDefault());
            return Ok(await _executionNodeService.UpsertRouteTargetAsync(node, request));
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node token." });
        }
    }

    [HttpPost("{id:guid}/stops/complete")]
    public async Task<IActionResult> CompleteStop(Guid id, [FromBody] CompleteStopRequest request)
    {
        try
        {
            var node = await _executionNodeService.AuthenticateAsync(id, Request.Headers[NodeTokenHeader].FirstOrDefault());
            await _executionNodeService.CompleteStopAsync(node, request);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project stop lease not found for this execution node." });
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node token." });
        }
    }

    [HttpPost("{id:guid}/deletes/complete")]
    public async Task<IActionResult> CompleteDelete(Guid id, [FromBody] CompleteDeleteRequest request)
    {
        try
        {
            var node = await _executionNodeService.AuthenticateAsync(id, Request.Headers[NodeTokenHeader].FirstOrDefault());
            await _executionNodeService.CompleteDeleteAsync(node, request);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project delete lease not found for this execution node." });
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node token." });
        }
    }

    [HttpGet("{id:guid}/cleanup-inventory")]
    public async Task<ActionResult<CleanupInventoryResponse>> GetCleanupInventory(Guid id)
    {
        try
        {
            var node = await _executionNodeService.AuthenticateAsync(id, Request.Headers[NodeTokenHeader].FirstOrDefault());
            return Ok(await _executionNodeService.GetCleanupInventoryAsync(node));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Execution node not found." });
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid execution node token." });
        }
    }
}
