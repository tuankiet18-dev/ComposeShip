using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OneClickHost.Api.DTOs.Auth;
using OneClickHost.Api.Services;

namespace OneClickHost.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private const string AccessTokenCookieName = "access_token";
    private readonly AuthService _authService;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public AuthController(AuthService authService, IConfiguration configuration, IWebHostEnvironment environment)
    {
        _authService = authService;
        _configuration = configuration;
        _environment = environment;
    }

    [HttpPost("register")]
    [EnableRateLimiting("InviteRedemption")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        try
        {
            await _authService.RegisterAsync(request);
            return Accepted(new { message = "Registration processed successfully. Please log in to continue." });
        }
        catch (InvalidOperationException)
        {
            // Simulate success to prevent email enumeration
            return Accepted(new { message = "Registration processed successfully. Please log in to continue." });
        }
        catch (OneClickHost.Api.Exceptions.InviteRejectedException)
        {
            return Accepted(new { message = "Registration processed successfully. Please log in to continue." });
        }
    }

    [HttpPost("login")]
    [EnableRateLimiting("Auth")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        try
        {
            var response = await _authService.LoginAsync(request);
            SetAccessTokenCookie(response.Token);
            return Ok(CreateClientAuthResponse(response));
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserProfileResponse>> GetProfile()
    {
        var userId = GetUserId();
        var profile = await _authService.GetProfileAsync(userId);
        return Ok(profile);
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(AccessTokenCookieName, CreateCookieOptions());
        return NoContent();
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException();
        return Guid.Parse(claim);
    }

    private void SetAccessTokenCookie(string token)
    {
        var options = CreateCookieOptions();
        var expiryHours = int.Parse(_configuration["Jwt:ExpiryHours"] ?? "24");
        options.Expires = DateTimeOffset.UtcNow.AddHours(expiryHours);
        Response.Cookies.Append(AccessTokenCookieName, token, options);
    }

    private AuthResponse CreateClientAuthResponse(AuthResponse response) =>
        _environment.IsDevelopment() ? response : response with { Token = string.Empty };

    private CookieOptions CreateCookieOptions() => new()
    {
        HttpOnly = true,
        Secure = ShouldUseSecureCookie(),
        SameSite = SameSiteMode.Lax,
        Path = "/"
    };

    private bool ShouldUseSecureCookie()
    {
        var configured = _configuration["Auth:CookieSecure"];
        return bool.TryParse(configured, out var cookieSecure)
            ? cookieSecure
            : !_environment.IsDevelopment();
    }
}
