using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneClickHost.Api.DTOs.Services;
using OneClickHost.Api.Services;

namespace OneClickHost.Api.Controllers;

[ApiController]
[Authorize]
public class ServicesController : ControllerBase
{
    private readonly ServiceService _serviceService;

    public ServicesController(ServiceService serviceService)
    {
        _serviceService = serviceService;
    }

    [HttpGet("api/projects/{projectId:guid}/services")]
    public async Task<ActionResult<List<ServiceResponse>>> GetServices(Guid projectId)
    {
        try
        {
            var userId = GetUserId();
            var services = await _serviceService.GetServicesAsync(projectId, userId);
            return Ok(services);
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

    [HttpPost("api/projects/{projectId:guid}/services")]
    public async Task<ActionResult<ServiceResponse>> CreateService(Guid projectId, [FromBody] CreateServiceRequest request)
    {
        try
        {
            var userId = GetUserId();
            var service = await _serviceService.CreateServiceAsync(projectId, userId, request);
            return CreatedAtAction(nameof(GetService), new { id = service.Id }, service);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Project not found." });
        }
    }

    [HttpGet("api/services/{id:guid}")]
    public async Task<ActionResult<ServiceDetailResponse>> GetService(Guid id)
    {
        try
        {
            var userId = GetUserId();
            var service = await _serviceService.GetServiceAsync(id, userId);
            return Ok(service);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("api/services/{id:guid}")]
    public async Task<ActionResult<ServiceResponse>> UpdateService(Guid id, [FromBody] UpdateServiceRequest request)
    {
        try
        {
            var userId = GetUserId();
            var service = await _serviceService.UpdateServiceAsync(id, userId, request);
            return Ok(service);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("api/services/{id:guid}")]
    public async Task<IActionResult> DeleteService(Guid id)
    {
        try
        {
            var userId = GetUserId();
            await _serviceService.DeleteServiceAsync(id, userId);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
    }

    [HttpPost("api/services/{id:guid}/stop")]
    public async Task<IActionResult> StopService(Guid id)
    {
        try
        {
            var userId = GetUserId();
            await _serviceService.StopServiceAsync(id, userId);
            return Accepted();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("api/services/{serviceId:guid}/env")]
    public async Task<ActionResult<List<EnvVarResponse>>> GetEnvVars(Guid serviceId)
    {
        try
        {
            var userId = GetUserId();
            var envVars = await _serviceService.GetEnvVarsAsync(serviceId, userId);
            return Ok(envVars);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
    }

    [HttpPut("api/services/{serviceId:guid}/env")]
    public async Task<IActionResult> UpdateEnvVars(Guid serviceId, [FromBody] List<EnvVarUpdateRequest> envVars)
    {
        try
        {
            var userId = GetUserId();
            await _serviceService.UpdateEnvVarsAsync(serviceId, userId, envVars);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Service not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException();
        return Guid.Parse(claim);
    }
}
